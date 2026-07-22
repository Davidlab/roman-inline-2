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
					// Atomic string prop (e.g. YouTube widget's 'source').
					$node['settings'][ $key ] = [
						'$$type' => 'string',
						'value'  => $clean_url,
					];
				} else {
					// Classic widget — handle video_type + hosted mode switching.
					$video_type = isset( $node['settings']['video_type'] ) ? (string) $node['settings']['video_type'] : '';

					if ( $is_media ) {
						// User chose Self Hosted via media library.
						// Switch to hosted + media library mode.
						$node['settings']['video_type'] = 'hosted';
						$node['settings']['insert_url'] = '';
						$node['settings']['hosted_url'] = [
							'id'  => $attachment_id,
							'url' => $clean_url,
						];
					} else {
						// User chose Video URL.
						// Detect the service from the URL and switch video_type accordingly.
						$new_type = self::detect_video_type( $clean_url );
						if ( 'hosted' === $new_type ) {
							// URL doesn't match a known service — treat as hosted external URL.
							$node['settings']['video_type'] = 'hosted';
							$node['settings']['insert_url'] = 'yes';
							$node['settings']['external_url'] = $clean_url;
						} else {
							// YouTube, Vimeo, etc. — save to {type}_url as plain string.
							$node['settings']['video_type'] = $new_type;
							$url_key                     = $new_type . '_url';
							$node['settings'][ $url_key ] = $clean_url;
						}
					}
				}

				return [
					'success' => true,
					'key'     => $key,
					'value'   => $clean_url,
				];
			}
		);
	}

	/**
	 * Detect the Elementor video_type from a URL.
	 *
	 * @param string $url
	 * @return string 'youtube', 'vimeo', 'dailymotion', or 'hosted' (fallback).
	 */
	private static function detect_video_type( $url ) {
		$url = strtolower( (string) $url );
		if ( preg_match( '#(?:youtube\.com|youtu\.be)#i', $url ) ) {
			return 'youtube';
		}
		if ( preg_match( '#vimeo\.com#i', $url ) ) {
			return 'vimeo';
		}
		if ( preg_match( '#dailymotion\.com#i', $url ) ) {
			return 'dailymotion';
		}
		return 'hosted';
	}

	/* --------------------------------------------------------------------- */
	/* Poster / Overlay Image                                                 */
	/* --------------------------------------------------------------------- */

	/**
	 * Save a poster or overlay image change from the media library.
	 *
	 * Atomic: updates the image prop tree for the given key (e.g. 'poster').
	 * Classic: updates settings[key] as { id, url } (MEDIA control shape).
	 *
	 * @param int    $post_id
	 * @param string $element_id
	 * @param string $key         Setting key ('poster' or 'image_overlay').
	 * @param int    $attachment_id
	 * @param bool   $is_atomic
	 * @return array|\WP_Error
	 */
	public static function save_poster( $post_id, $element_id, $key, $attachment_id, $is_atomic ) {
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
			function ( array &$node ) use ( $key, $attachment_id, $url, $is_atomic ) {
				if ( ! isset( $node['settings'] ) || ! is_array( $node['settings'] ) ) {
					$node['settings'] = [];
				}

				if ( $is_atomic ) {
					$existing_size = 'full';
					if ( isset( $node['settings'][ $key ]['value']['size']['value'] ) && is_string( $node['settings'][ $key ]['value']['size']['value'] ) ) {
						$existing_size = $node['settings'][ $key ]['value']['size']['value'];
					}
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
							'size' => [
								'$$type' => 'string',
								'value'  => $existing_size,
							],
						],
					];
				} else {
					// Classic MEDIA control stores { id, url }.
					$node['settings'][ $key ] = [
						'id'  => $attachment_id,
						'url' => $url,
					];
				}

				return [
					'success' => true,
					'key'     => $key,
					'value'   => $url,
				];
			}
		);
	}

	/**
	 * Save an icon change for a classic widget (ICONS control).
	 *
	 * Stores { value, library } at settings[ $key ].
	 *
	 * @param int    $post_id
	 * @param string $element_id
	 * @param string $key
	 * @param string $value     Icon class (e.g. 'fas fa-star').
	 * @param string $library   Icon library (e.g. 'fa-solid').
	 * @return array|\WP_Error
	 */
	public static function save_icon( $post_id, $element_id, $key, $value, $library ) {
		$value   = (string) $value;
		$library = (string) $library;

		if ( '' === $value ) {
			return new \WP_Error( 'ri2_no_icon', __( 'No icon selected.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		$document = new Document( $post_id );

		return $document->mutate_node(
			$element_id,
			function ( array &$node ) use ( $key, $value, $library ) {
				if ( ! isset( $node['settings'] ) || ! is_array( $node['settings'] ) ) {
					$node['settings'] = [];
				}
				$node['settings'][ $key ] = [
					'value'   => $value,
					'library' => $library,
				];
				return [
					'success' => true,
					'key'     => $key,
					'value'   => $value,
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
	 * Save a background image change.
	 *
	 * Atomic (e-flexbox, e-div-block): updates the image prop in the styles tree.
	 * Classic (container, section):    updates settings.background_background + settings.background_image.
	 *
	 * @param int    $post_id
	 * @param string $element_id
	 * @param int    $attachment_id
	 * @param bool   $is_atomic
	 * @param string $style_id       Atomic only: style ID in the styles tree.
	 * @param int    $variant_index  Atomic only: variant index.
	 * @param int    $overlay_index  Atomic only: overlay item index.
	 * @return array|\WP_Error
	 */
	public static function save_background( $post_id, $element_id, $attachment_id, $is_atomic = false, $style_id = '', $variant_index = 0, $overlay_index = 0 ) {
		$attachment_id = absint( $attachment_id );
		if ( ! $attachment_id || 'attachment' !== get_post_type( $attachment_id ) || ! wp_attachment_is_image( $attachment_id ) ) {
			return new \WP_Error( 'ri2_invalid_attachment', __( 'Please choose a valid image.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		$url = wp_get_attachment_url( $attachment_id );
		if ( ! $url ) {
			return new \WP_Error( 'ri2_no_url', __( 'Could not resolve the image URL.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		$document = new Document( $post_id );

		if ( ! $is_atomic ) {
			// Classic path: update settings.background_background + settings.background_image.
			return $document->mutate_node(
				$element_id,
				function ( array &$node ) use ( $attachment_id, $url ) {
					if ( ! isset( $node['settings'] ) || ! is_array( $node['settings'] ) ) {
						$node['settings'] = [];
					}
					$node['settings']['background_background'] = 'classic';
					$node['settings']['background_image'] = [
						'id'     => $attachment_id,
						'url'    => $url,
						'size'   => '',
						'alt'    => '',
						'source' => 'library',
					];
					return [
						'success' => true,
						'value'   => $url,
					];
				}
			);
		}

		// Atomic path: update image prop inside the styles tree.
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

	/**
	 * Save a gallery change (replace, delete, or add an image).
	 *
	 * Classic gallery control stores an array of { id, url } objects in
	 * settings[ $key ]. This method mutates the array in-place.
	 *
	 * @param int    $post_id
	 * @param string $element_id
	 * @param string $key          Settings key (e.g. 'wp_gallery').
	 * @param string $action       'replace', 'delete', or 'add'.
	 * @param int    $attachment_id Attachment ID for replace/add (0 for delete).
	 * @param int    $index         Index for replace/delete (ignored for add).
	 * @return array|\WP_Error
	 */
	public static function save_gallery( $post_id, $element_id, $key, $action, $attachment_id = 0, $index = -1 ) {
		$attachment_id = absint( $attachment_id );

		if ( 'delete' !== $action && ! $attachment_id ) {
			return new \WP_Error( 'ri2_invalid_attachment', __( 'Please choose a valid image.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		$url = '';
		if ( $attachment_id ) {
			$url = wp_get_attachment_url( $attachment_id );
			if ( ! $url ) {
				return new \WP_Error( 'ri2_no_url', __( 'Could not resolve the image URL.', 'roman-inline-2' ), [ 'status' => 400 ] );
			}
		}

		$document = new Document( $post_id );

		return $document->mutate_node(
			$element_id,
			function ( array &$node ) use ( $key, $action, $attachment_id, $url, $index ) {
				if ( ! isset( $node['settings'] ) || ! is_array( $node['settings'] ) ) {
					$node['settings'] = [];
				}
				if ( ! isset( $node['settings'][ $key ] ) || ! is_array( $node['settings'][ $key ] ) ) {
					$node['settings'][ $key ] = [];
				}

				$gallery = &$node['settings'][ $key ];

				if ( 'replace' === $action ) {
					if ( $index < 0 || $index >= count( $gallery ) ) {
						return new \WP_Error( 'ri2_bad_index', __( 'Invalid gallery index.', 'roman-inline-2' ), [ 'status' => 400 ] );
					}
					$gallery[ $index ] = [
						'id'     => $attachment_id,
						'url'    => $url,
					];
				} elseif ( 'delete' === $action ) {
					if ( $index < 0 || $index >= count( $gallery ) ) {
						return new \WP_Error( 'ri2_bad_index', __( 'Invalid gallery index.', 'roman-inline-2' ), [ 'status' => 400 ] );
					}
					array_splice( $gallery, $index, 1 );
				} elseif ( 'add' === $action ) {
					$gallery[] = [
						'id'     => $attachment_id,
						'url'    => $url,
					];
				} else {
					return new \WP_Error( 'ri2_bad_action', __( 'Unknown gallery action.', 'roman-inline-2' ), [ 'status' => 400 ] );
				}

				unset( $gallery );

				return [
					'success' => true,
					'count'   => count( $node['settings'][ $key ] ),
				];
			}
		);
	}

	/**
	 * Save a single slide field within a repeater.
	 *
	 * @param int    $post_id
	 * @param string $element_id
	 * @param string $key       Repeater settings key (e.g. 'slides').
	 * @param int    $index     Slide index.
	 * @param string $sub_field Sub-field name: 'heading', 'description', 'link', 'background_image'.
	 * @param mixed  $value     New value (string for text, array for link, int for image attachment_id).
	 * @return array|\WP_Error
	 */
	public static function save_slides( $post_id, $element_id, $key, $index, $sub_field, $value ) {
		$index     = (int) $index;
		$sub_field = (string) $sub_field;

		$document = new Document( $post_id );

		return $document->mutate_node(
			$element_id,
			function ( array &$node ) use ( $key, $index, $sub_field, $value ) {
				if ( ! isset( $node['settings'] ) || ! is_array( $node['settings'] ) ) {
					$node['settings'] = [];
				}
				if ( ! isset( $node['settings'][ $key ] ) || ! is_array( $node['settings'][ $key ] ) ) {
					$node['settings'][ $key ] = [];
				}

				$slides = &$node['settings'][ $key ];

				if ( $index < 0 || $index >= count( $slides ) ) {
					return new \WP_Error( 'ri2_bad_slide_index', __( 'Invalid slide index.', 'roman-inline-2' ), [ 'status' => 400 ] );
				}

				if ( ! isset( $slides[ $index ] ) || ! is_array( $slides[ $index ] ) ) {
					$slides[ $index ] = [];
				}

				switch ( $sub_field ) {
					case 'heading':
					case 'description':
					case 'gallery_title':
						$slides[ $index ][ $sub_field ] = (string) $value;
						break;

					case 'link':
						if ( ! is_array( $value ) ) {
							return new \WP_Error( 'ri2_bad_link', __( 'Invalid link data.', 'roman-inline-2' ), [ 'status' => 400 ] );
						}
						$slides[ $index ]['link'] = [
							'url'         => isset( $value['url'] ) ? (string) $value['url'] : '',
							'is_external' => ! empty( $value['is_external'] ) ? true : '',
							'nofollow'    => ! empty( $value['nofollow'] ) ? true : '',
						];
						break;

					case 'background_image':
						$attachment_id = absint( $value );
						if ( ! $attachment_id ) {
							return new \WP_Error( 'ri2_invalid_attachment', __( 'Please choose a valid image.', 'roman-inline-2' ), [ 'status' => 400 ] );
						}
						$url = wp_get_attachment_url( $attachment_id );
						if ( ! $url ) {
							return new \WP_Error( 'ri2_no_url', __( 'Could not resolve the image URL.', 'roman-inline-2' ), [ 'status' => 400 ] );
						}
						$slides[ $index ]['background_image'] = [
							'id'  => $attachment_id,
							'url' => $url,
						];
						break;

					default:
						return new \WP_Error( 'ri2_bad_subfield', __( 'Unknown slide field.', 'roman-inline-2' ), [ 'status' => 400 ] );
				}

				unset( $slides );

				return [
					'success' => true,
				];
			}
		);
	}

	/**
	 * Save a Pro Gallery image operation (replace, delete, or add).
	 *
	 * Supports both single mode (key='gallery') and multiple mode
	 * (key='galleries'). For replace/delete, the client sends
	 * old_attachment_id to identify the image by its attachment ID,
	 * since the DOM order may differ from the settings array order
	 * (deduplication and optional shuffling).
	 *
	 * @param int    $post_id
	 * @param string $element_id
	 * @param string $key             'gallery' (single) or 'galleries' (multiple).
	 * @param string $action          'replace', 'delete', or 'add'.
	 * @param int    $attachment_id   New attachment ID for replace/add (0 for delete).
	 * @param int    $old_attachment_id  ID of the image to replace/delete.
	 * @param int    $gallery_index   For multiple mode add: which repeater gallery.
	 * @return array|\WP_Error
	 */
	public static function save_pro_gallery( $post_id, $element_id, $key, $action, $attachment_id = 0, $old_attachment_id = 0, $gallery_index = -1 ) {
		$attachment_id     = absint( $attachment_id );
		$old_attachment_id = absint( $old_attachment_id );

		if ( 'delete' !== $action && ! $attachment_id ) {
			return new \WP_Error( 'ri2_invalid_attachment', __( 'Please choose a valid image.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}
		if ( ( 'replace' === $action || 'delete' === $action ) && ! $old_attachment_id ) {
			return new \WP_Error( 'ri2_no_old_id', __( 'Could not identify the image to replace.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		$url = '';
		if ( $attachment_id ) {
			$url = wp_get_attachment_url( $attachment_id );
			if ( ! $url ) {
				return new \WP_Error( 'ri2_no_url', __( 'Could not resolve the image URL.', 'roman-inline-2' ), [ 'status' => 400 ] );
			}
		}

		$document = new Document( $post_id );

		return $document->mutate_node(
			$element_id,
			function ( array &$node ) use ( $key, $action, $attachment_id, $old_attachment_id, $url, $gallery_index ) {
				if ( ! isset( $node['settings'] ) || ! is_array( $node['settings'] ) ) {
					$node['settings'] = [];
				}

				if ( 'galleries' === $key ) {
					// Multiple mode: operate across all sub-galleries.
					if ( ! isset( $node['settings']['galleries'] ) || ! is_array( $node['settings']['galleries'] ) ) {
						return new \WP_Error( 'ri2_no_galleries', __( 'No galleries found.', 'roman-inline-2' ), [ 'status' => 400 ] );
					}

					if ( 'add' === $action ) {
						// Add to the specified gallery (or first one).
						$gi = $gallery_index >= 0 ? $gallery_index : 0;
						if ( ! isset( $node['settings']['galleries'][ $gi ]['multiple_gallery'] ) || ! is_array( $node['settings']['galleries'][ $gi ]['multiple_gallery'] ) ) {
							$node['settings']['galleries'][ $gi ]['multiple_gallery'] = [];
						}
						$node['settings']['galleries'][ $gi ]['multiple_gallery'][] = [
							'id'  => $attachment_id,
							'url' => $url,
						];
					} else {
						// Replace/delete: search all sub-galleries.
						$found = false;
						foreach ( $node['settings']['galleries'] as &$gal ) {
							if ( ! isset( $gal['multiple_gallery'] ) || ! is_array( $gal['multiple_gallery'] ) ) {
								continue;
							}
							$mg = &$gal['multiple_gallery'];
							for ( $i = count( $mg ) - 1; $i >= 0; $i-- ) {
								if ( isset( $mg[ $i ]['id'] ) && (int) $mg[ $i ]['id'] === $old_attachment_id ) {
									if ( 'replace' === $action ) {
										$mg[ $i ] = [ 'id' => $attachment_id, 'url' => $url ];
									} else { // delete
										array_splice( $mg, $i, 1 );
									}
									$found = true;
								}
							}
							unset( $mg );
						}
						unset( $gal );

						if ( ! $found ) {
							return new \WP_Error( 'ri2_not_found', __( 'Image not found in gallery.', 'roman-inline-2' ), [ 'status' => 400 ] );
						}
					}
				} else {
					// Single mode.
					if ( ! isset( $node['settings'][ $key ] ) || ! is_array( $node['settings'][ $key ] ) ) {
						$node['settings'][ $key ] = [];
					}
					$gallery = &$node['settings'][ $key ];

					if ( 'add' === $action ) {
						$gallery[] = [
							'id'  => $attachment_id,
							'url' => $url,
						];
					} else {
						// Replace/delete by old attachment ID.
						$found = false;
						for ( $i = count( $gallery ) - 1; $i >= 0; $i-- ) {
							if ( isset( $gallery[ $i ]['id'] ) && (int) $gallery[ $i ]['id'] === $old_attachment_id ) {
								if ( 'replace' === $action ) {
									$gallery[ $i ] = [ 'id' => $attachment_id, 'url' => $url ];
								} else {
									array_splice( $gallery, $i, 1 );
								}
								$found = true;
							}
						}

						if ( ! $found ) {
							return new \WP_Error( 'ri2_not_found', __( 'Image not found in gallery.', 'roman-inline-2' ), [ 'status' => 400 ] );
						}
					}

					unset( $gallery );
				}

				return [
					'success' => true,
				];
			}
		);
	}

	/**
	 * Update attachment metadata (title, caption, alt, description).
	 *
	 * @param int    $attachment_id
	 * @param string $field       'title', 'caption', 'alt', or 'description'.
	 * @param string $value
	 * @return array|\WP_Error
	 */
	public static function save_attachment_meta( $attachment_id, $field, $value ) {
		$attachment_id = absint( $attachment_id );
		$field         = (string) $field;
		$value         = (string) $value;

		if ( ! $attachment_id ) {
			return new \WP_Error( 'ri2_invalid_attachment', __( 'Invalid attachment ID.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		$allowed = [ 'title', 'caption', 'alt', 'description' ];
		if ( ! in_array( $field, $allowed, true ) ) {
			return new \WP_Error( 'ri2_bad_meta_field', __( 'Unknown attachment field.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		$post = get_post( $attachment_id );
		if ( ! $post || 'attachment' !== $post->post_type ) {
			return new \WP_Error( 'ri2_not_attachment', __( 'Not an attachment.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		switch ( $field ) {
			case 'title':
				wp_update_post( [
					'ID'         => $attachment_id,
					'post_title' => $value,
				] );
				break;
			case 'caption':
				wp_update_post( [
					'ID'           => $attachment_id,
					'post_excerpt' => $value,
				] );
				break;
			case 'description':
				wp_update_post( [
					'ID'         => $attachment_id,
					'post_content' => $value,
				] );
				break;
			case 'alt':
				update_post_meta( $attachment_id, '_wp_attachment_image_alt', $value );
				break;
		}

		return [
			'success' => true,
			'field'   => $field,
			'value'   => $value,
		];
	}
}
