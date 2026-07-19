<?php
/**
 * Writes validated client edits back into the Elementor document.
 *
 * Atomic text  -> Html_V3 prop tree
 * Classic text -> plain (k)sanitized string at settings[key]
 * Atomic link  -> Link prop tree
 * Classic link -> settings.link.url (+ is_external)
 * Atomic image -> image prop tree
 * Classic image -> { id, url } at settings[key]
 * Atomic video (video-src) -> video-src prop tree (media: id set, url null; url: url set, id null)
 * Atomic video (string) -> string prop tree (e.g. YouTube widget's 'source')
 * Classic image -> { id, url } at settings[key]
 *
 * @package RomanInline2
 */

namespace RomanInline2;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Saver {

	/**
	 * @param int    $post_id
	 * @param string $element_id
	 * @param string $key
	 * @param string $value     Raw HTML/text from the client.
	 * @param bool   $is_atomic
	 * @param string $kind      'rich_text' | 'text'
	 * @return array|\WP_Error
	 */
	public static function save_text( $post_id, $element_id, $key, $value, $is_atomic, $kind ) {
		$document = new Document( $post_id );

		return $document->mutate_node(
			$element_id,
			function ( array &$node ) use ( $key, $value, $is_atomic, $kind ) {
				$clean = ( 'rich_text' === $kind )
					? wp_kses( (string) $value, self::rich_allowed_tags() )
					: wp_kses( (string) $value, self::inline_allowed_tags() );

				if ( $is_atomic ) {
					$children = [];
					if ( isset( $node['settings'][ $key ]['value']['children'] ) && is_array( $node['settings'][ $key ]['value']['children'] ) ) {
						$children = $node['settings'][ $key ]['value']['children'];
					}
					$node['settings'][ $key ] = [
						'$$type' => 'html-v3',
						'value'  => [
							'content'  => [
								'$$type' => 'string',
								'value'  => $clean,
							],
							'children' => $children,
						],
					];
				} else {
					if ( ! isset( $node['settings'] ) || ! is_array( $node['settings'] ) ) {
						$node['settings'] = [];
					}
					$node['settings'][ $key ] = $clean;
				}

				return [
					'success' => true,
					'key'     => $key,
					'value'   => $clean,
				];
			}
		);
	}

	/**
	 * @param int    $post_id
	 * @param string $element_id
	 * @param string $key
	 * @param string $url
	 * @param bool   $target_blank
	 * @param bool   $is_atomic
	 * @return array|\WP_Error
	 */
	public static function save_link( $post_id, $element_id, $key, $url, $target_blank, $is_atomic ) {
		$clean_url = '' === trim( (string) $url ) ? '' : esc_url_raw( trim( (string) $url ) );
		$document  = new Document( $post_id );

		return $document->mutate_node(
			$element_id,
			function ( array &$node ) use ( $key, $clean_url, $target_blank, $is_atomic ) {
				if ( ! isset( $node['settings'] ) || ! is_array( $node['settings'] ) ) {
					$node['settings'] = [];
				}

				if ( $is_atomic ) {
					if ( '' === $clean_url ) {
						$node['settings'][ $key ] = null;
						return [ 'success' => true, 'key' => $key, 'value' => '' ];
					}

					$tag = 'a';
					if ( isset( $node['settings'][ $key ]['value']['tag']['value'] ) && is_string( $node['settings'][ $key ]['value']['tag']['value'] ) ) {
						$tag = $node['settings'][ $key ]['value']['tag']['value'];
					}

					$value = [
						'destination' => [
							'$$type' => 'url',
							'value'  => $clean_url,
						],
						'tag'         => [
							'$$type' => 'string',
							'value'  => $tag,
						],
					];
					if ( $target_blank ) {
						$value['isTargetBlank'] = [
							'$$type' => 'boolean',
							'value'  => true,
						];
					}

					$node['settings'][ $key ] = [
						'$$type' => 'link',
						'value'  => $value,
					];

					return [ 'success' => true, 'key' => $key, 'value' => $clean_url ];
				}

				$existing = isset( $node['settings'][ $key ] ) && is_array( $node['settings'][ $key ] ) ? $node['settings'][ $key ] : [];
				$existing['url']         = $clean_url;
				$existing['is_external'] = $target_blank ? 'on' : '';
				if ( ! array_key_exists( 'nofollow', $existing ) ) {
					$existing['nofollow'] = '';
				}
				$node['settings'][ $key ] = $existing;

				return [ 'success' => true, 'key' => $key, 'value' => $clean_url ];
			}
		);
	}

	/**
	 * @param int    $post_id
	 * @param string $element_id
	 * @param string $key         Setting key (atomic prop name or classic control name).
	 * @param int    $attachment_id
	 * @param bool   $is_atomic
	 * @return array|\WP_Error
	 */
	public static function save_image( $post_id, $element_id, $key, $attachment_id, $is_atomic ) {
		$attachment_id = absint( $attachment_id );
		if ( ! $attachment_id || 'attachment' !== get_post_type( $attachment_id ) || ! wp_attachment_is_image( $attachment_id ) ) {
			return new \WP_Error( 'ri2_invalid_attachment', __( 'Please choose a valid image.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		$new_url = wp_get_attachment_url( $attachment_id );
		if ( ! $new_url ) {
			return new \WP_Error( 'ri2_no_url', __( 'Could not resolve the image URL.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}
		$alt = (string) get_post_meta( $attachment_id, '_wp_attachment_image_alt', true );

		$document = new Document( $post_id );

		$result = $document->mutate_node(
			$element_id,
			function ( array &$node ) use ( $key, $attachment_id, $new_url, $alt, $is_atomic ) {
				if ( ! isset( $node['settings'] ) || ! is_array( $node['settings'] ) ) {
					$node['settings'] = [];
				}

				if ( $is_atomic ) {
					// Preserve the existing prop tree — only swap the attachment id.
					if ( ! isset( $node['settings'][ $key ] ) || ! is_array( $node['settings'][ $key ] ) ) {
						$node['settings'][ $key ] = [
							'$$type' => 'image',
							'value'  => [
								'src' => [
									'$$type' => 'image-src',
									'value'  => [
										'id'  => [
											'$$type' => 'image-attachment-id',
											'value'  => $attachment_id,
										],
										'url' => null,
									],
								],
							],
						];
					} else {
						// Walk into the existing tree and update the id value.
						if ( isset( $node['settings'][ $key ]['value']['src']['value']['id'] ) ) {
							$node['settings'][ $key ]['value']['src']['value']['id']['value'] = $attachment_id;
						} else {
							// Fallback: set the id path if missing.
							$node['settings'][ $key ]['value']['src']['value']['id'] = [
								'$$type' => 'image-attachment-id',
								'value'  => $attachment_id,
							];
						}
						// Clear any cached url so Elementor re-resolves from the id.
						if ( isset( $node['settings'][ $key ]['value']['src']['value']['url'] ) ) {
							$node['settings'][ $key ]['value']['src']['value']['url'] = null;
						}
					}
				} else {
					$node['settings'][ $key ] = [
						'id'  => $attachment_id,
						'url' => $new_url,
						'alt' => $alt,
					];
				}

				return [ 'success' => true ];
			}
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$srcset = wp_get_attachment_image_srcset( $attachment_id, 'full' );
		$sizes  = wp_get_attachment_image_sizes( $attachment_id, 'full' );

		return [
			'success' => true,
			'id'      => $attachment_id,
			'url'     => $new_url,
			'srcset'  => $srcset ? $srcset : '',
			'sizes'   => $sizes ? $sizes : '',
			'alt'     => $alt,
		];
	}

	/**
	 * Save a video change — either from media library (attachment_id) or
	 * an external URL (e.g. YouTube, Vimeo).
	 *
	 * Atomic + video-src + media:  video-src prop tree with id set, url null.
	 * Atomic + video-src + url:    video-src prop tree with url set, id null.
	 * Atomic + string:             string prop tree (e.g. YouTube widget's 'source').
	 *
	 * @param int    $post_id
	 * @param string $element_id
	 * @param string $key         Setting key (atomic prop name).
	 * @param int    $attachment_id  Media library attachment ID (0 if URL-based).
	 * @param string $url          External video URL (empty if media-based).
	 * @param bool   $is_atomic
	 * @param string $source_type  'media' or 'url' (from Field_Resolver).
	 * @return array|\WP_Error
	 */
	public static function save_video( $post_id, $element_id, $key, $attachment_id, $url, $is_atomic, $source_type = '' ) {
		$attachment_id = absint( $attachment_id );
		$clean_url     = esc_url_raw( trim( (string) $url ) );
		$is_media      = $attachment_id > 0;

		if ( $is_media ) {
			if ( 'attachment' !== get_post_type( $attachment_id ) ) {
				return new \WP_Error( 'ri2_invalid_attachment', __( 'Please choose a valid video.', 'roman-inline-2' ), [ 'status' => 400 ] );
			}
			$resolved_url = wp_get_attachment_url( $attachment_id );
			if ( ! $resolved_url ) {
				return new \WP_Error( 'ri2_no_url', __( 'Could not resolve the video URL.', 'roman-inline-2' ), [ 'status' => 400 ] );
			}
			$clean_url = $resolved_url;
		} elseif ( ! $clean_url ) {
			return new \WP_Error( 'ri2_no_video', __( 'No video URL or attachment provided.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		$document = new Document( $post_id );

		return $document->mutate_node(
			$element_id,
			function ( array &$node ) use ( $key, $attachment_id, $clean_url, $is_media, $is_atomic, $source_type ) {
				if ( ! isset( $node['settings'] ) || ! is_array( $node['settings'] ) ) {
					$node['settings'] = [];
				}

				$is_video_src = 'media' === $source_type ||
					( isset( $node['settings'][ $key ]['$$type'] ) && 'video-src' === $node['settings'][ $key ]['$$type'] );

				if ( $is_atomic && $is_video_src ) {
					if ( $is_media ) {
						$node['settings'][ $key ] = [
							'$$type' => 'video-src',
							'value'  => [
								'id'  => [
									'$$type' => 'video-attachment-id',
									'value'  => $attachment_id,
								],
								'url' => null,
							],
						];
					} else {
						$node['settings'][ $key ] = [
							'$$type' => 'video-src',
							'value'  => [
								'id'  => null,
								'url' => [
									'$$type' => 'url',
									'value'  => $clean_url,
								],
							],
						];
					}
				} elseif ( $is_atomic ) {
					$node['settings'][ $key ] = [
						'$$type' => 'string',
						'value'  => $clean_url,
					];
				}

				return [
					'success' => true,
					'key'     => $key,
					'value'   => $clean_url,
				];
			}
		);
	}

	private static function inline_allowed_tags() {
		return [
			'a'      => [ 'href' => true, 'target' => true, 'rel' => true, 'class' => true, 'id' => true ],
			'b'      => [],
			'strong' => [],
			'i'      => [],
			'em'     => [],
			'u'      => [],
			's'      => [],
			'del'    => [],
			'sup'    => [],
			'sub'    => [],
			'span'   => [ 'class' => true, 'id' => true ],
			'br'     => [],
		];
	}

	private static function rich_allowed_tags() {
		return array_merge(
			self::inline_allowed_tags(),
			[
				'p'          => [ 'class' => true, 'style' => true ],
				'ul'         => [ 'class' => true ],
				'ol'         => [ 'class' => true ],
				'li'         => [ 'class' => true ],
				'blockquote' => [ 'class' => true ],
				'h1'         => [], 'h2' => [], 'h3' => [], 'h4' => [], 'h5' => [], 'h6' => [],
			]
		);
	}

	/* --------------------------------------------------------------------- */
	/* Background Image (atomic containers)                                   */
	/* --------------------------------------------------------------------- */

	/**
	 * Save a background image change for an atomic container.
	 *
	 * Updates the image prop inside the styles tree at:
	 *   styles -> {style_id} -> variants -> [{variant_index}] -> props -> background
	 *     -> value -> background-overlay -> value -> [{overlay_index}]
	 *       -> value -> image
	 *
	 * @param int    $post_id
	 * @param string $element_id
	 * @param int    $attachment_id
	 * @param string $style_id
	 * @param int    $variant_index
	 * @param int    $overlay_index
	 * @return array|\WP_Error
	 */
	public static function save_background( $post_id, $element_id, $attachment_id, $style_id, $variant_index, $overlay_index ) {
		$attachment_id = absint( $attachment_id );
		if ( ! $attachment_id || 'attachment' !== get_post_type( $attachment_id ) || ! wp_attachment_is_image( $attachment_id ) ) {
			return new \WP_Error( 'ri2_invalid_attachment', __( 'Please choose a valid image.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		$url = wp_get_attachment_url( $attachment_id );
		if ( ! $url ) {
			return new \WP_Error( 'ri2_no_url', __( 'Could not resolve the image URL.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		$document = new Document( $post_id );

		return $document->mutate_node(
			$element_id,
			function ( array &$node ) use ( $attachment_id, $url, $style_id, $variant_index, $overlay_index ) {
				if ( ! isset( $node['styles'] ) || ! is_array( $node['styles'] ) ) {
					return new \WP_Error( 'ri2_no_styles', __( 'This element has no styles.', 'roman-inline-2' ), [ 'status' => 400 ] );
				}

				if ( ! isset( $node['styles'][ $style_id ]['variants'][ $variant_index ]['props']['background']['value']['background-overlay']['value'][ $overlay_index ] ) ) {
					return new \WP_Error( 'ri2_bg_not_found', __( 'Background image not found in styles.', 'roman-inline-2' ), [ 'status' => 400 ] );
				}

				$overlay = &$node['styles'][ $style_id ]['variants'][ $variant_index ]['props']['background']['value']['background-overlay']['value'][ $overlay_index ];

				// Preserve existing size if present, otherwise default to 'full'.
				$existing_size = 'full';
				if ( isset( $overlay['value']['image']['value']['size']['value'] ) && is_string( $overlay['value']['image']['value']['size']['value'] ) ) {
					$existing_size = $overlay['value']['image']['value']['size']['value'];
				}

				$overlay['value']['image'] = [
					'$$type' => 'image',
					'value'  => [
						'src' => [
							'$$type' => 'image-src',
							'value'  => [
								'id'  => [
									'$$type' => 'image-attachment-id',
									'value'  => $attachment_id,
								],
								'url' => null,
							],
						],
						'size' => [
							'$$type' => 'string',
							'value'  => $existing_size,
						],
					],
				];
				unset( $overlay );

				return [
					'success' => true,
					'value'   => $url,
				];
			}
		);
	}
}
