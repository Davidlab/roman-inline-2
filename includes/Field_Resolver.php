<?php
/**
 * Field resolver — discovers which parts of an Elementor element are editable.
 *
 * For atomic (V4) widgets: reads get_props_schema() and targets prop types
 * directly (Html_V3 = rich text, Link = link, Image = image).
 *
 * For classic/3rd-party widgets: renders with edit-mode forced and harvests
 * data-elementor-setting-key markers (same mechanism as Elementor's editor).
 *
 * @package RomanInline2
 */

namespace RomanInline2;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Field_Resolver {

	/**
	 * Resolve editable fields for an element.
	 *
	 * @param int    $post_id
	 * @param string $element_id
	 * @return array|\WP_Error
	 */
	public static function resolve( $post_id, $element_id ) {
		$document = new Document( $post_id );
		$read     = $document->read_node( $element_id );
		if ( is_wp_error( $read ) ) {
			return $read;
		}

		$node     = $read['node'];
		$type     = $read['type'];
		$instance = Document::create_instance( $node );
		$atomic   = Document::is_atomic( $instance );

		$result = [
			'element_id' => $element_id,
			'type'       => $type,
			'is_atomic'  => $atomic,
			'fields'     => [],
		];

		if ( $atomic ) {
			$result['fields'] = self::atomic_fields( $node, $instance );

			// Detect background images in atomic styles (e-flexbox, e-div-block).
			$backgrounds = self::atomic_background_fields( $node );
			foreach ( $backgrounds as $bg ) {
				$result['fields'][] = $bg;
			}
		} else {
			$result['fields'] = self::classic_fields( $node, $type, $instance );
		}

		$result['fields'] = apply_filters( 'roman_inline_2_resolve_fields', $result['fields'], $node, $post_id );

		return $result;
	}

	/* --------------------------------------------------------------------- */
	/* Atomic (V4)                                                            */
	/* --------------------------------------------------------------------- */

	private static function atomic_fields( array $node, $instance ) {
		$fields   = [];
		$settings = isset( $node['settings'] ) && is_array( $node['settings'] ) ? $node['settings'] : [];

		try {
			$schema = $instance::get_props_schema();
		} catch ( \Throwable $e ) {
			return $fields;
		}
		if ( ! is_array( $schema ) ) {
			return $fields;
		}

		foreach ( $schema as $key => $prop ) {
			$prop_key = self::prop_key( $prop );

			if ( 'html-v3' === $prop_key ) {
				$fields[] = [
					'key'   => $key,
					'kind'  => 'rich_text',
					'label' => self::humanize( $key ),
					'value' => self::atomic_html_value( $settings, $key ),
				];
			} elseif ( 'link' === $prop_key ) {
				$fields[] = [
					'key'          => $key,
					'kind'         => 'link',
					'label'        => self::humanize( $key ),
					'value'        => self::atomic_link_url( $settings, $key ),
					'target_blank' => self::atomic_link_target( $settings, $key ),
				];
			} elseif ( 'image' === $prop_key ) {
				$fields[] = [
					'key'   => $key,
					'kind'  => 'image',
					'label' => self::humanize( $key ),
					'value' => self::atomic_image_id( $settings, $key ),
				];
			} elseif ( 'video-src' === $prop_key ) {
				$fields[] = [
					'key'         => $key,
					'kind'        => 'video',
					'label'       => self::humanize( $key ),
					'value'       => self::atomic_video_url( $settings, $key ),
					'source_type' => self::atomic_video_source_type( $settings, $key ),
				];
			} elseif ( 'string' === $prop_key ) {
				$str_value = self::atomic_string_value( $settings, $key );
				if ( ! $str_value && method_exists( $prop, 'get_default' ) ) {
					$default = $prop->get_default();
					if ( is_array( $default ) && isset( $default['value'] ) && is_string( $default['value'] ) ) {
						$str_value = $default['value'];
					}
				}
				if ( $str_value && self::looks_like_video_url( $str_value ) ) {
					$fields[] = [
						'key'         => $key,
						'kind'        => 'video',
						'label'       => self::humanize( $key ),
						'value'       => $str_value,
						'source_type' => 'url',
					];
				}
			}
		}

		return $fields;
	}

	/**
	 * Detect background images in classic container and section nodes.
	 *
	 * Classic containers/sections store background in settings:
	 *   background_background = 'classic'
	 *   background_image      = { id, url, size, alt, source }
	 *
	 * @param array  $node
	 * @param string $type  Node type (elType: 'container' or 'section').
	 * @return array
	 */
	private static function classic_background_fields( array $node, $type ) {
		if ( ! in_array( $type, [ 'container', 'section' ], true ) ) {
			return [];
		}

		$settings = isset( $node['settings'] ) && is_array( $node['settings'] ) ? $node['settings'] : [];

		$bg_image = isset( $settings['background_image'] ) && is_array( $settings['background_image'] )
			? $settings['background_image']
			: [];

		$image_id  = isset( $bg_image['id'] ) ? (int) $bg_image['id'] : 0;
		$image_url = isset( $bg_image['url'] ) && is_string( $bg_image['url'] ) ? $bg_image['url'] : '';

		if ( ! $image_id && ! $image_url ) {
			return [];
		}

		return [
			[
				'kind'  => 'background',
				'label' => __( 'Background Image', 'roman-inline-2' ),
				'value' => $image_id,
				'key'   => 'background_image',
			],
		];
	}

	/**
	 * Detect classic gallery fields (gallery control type).
	 *
	 * Elementor's gallery control stores an array of { id, url } objects.
	 * We detect it via control introspection so any widget using a gallery
	 * control is supported (image-gallery, image-carousel, etc.).
	 *
	 * @param array        $node
	 * @param object|null  $instance
	 * @return array
	 */
	private static function classic_gallery_fields( array $node, $instance ) {
		if ( ! $instance ) {
			return [];
		}

		try {
			$controls = $instance->get_controls();
		} catch ( \Throwable $e ) {
			return [];
		}
		if ( ! is_array( $controls ) ) {
			return [];
		}

		$settings = isset( $node['settings'] ) && is_array( $node['settings'] ) ? $node['settings'] : [];
		$fields   = [];

		foreach ( $controls as $control ) {
			$ctype = isset( $control['type'] ) ? (string) $control['type'] : '';
			$name  = isset( $control['name'] ) ? (string) $control['name'] : '';
			if ( 'gallery' !== $ctype || '' === $name ) {
				continue;
			}

			$gallery = isset( $settings[ $name ] ) && is_array( $settings[ $name ] ) ? $settings[ $name ] : [];
			$images  = [];
			foreach ( $gallery as $img ) {
				if ( ! is_array( $img ) ) {
					continue;
				}
				$images[] = [
					'id'  => isset( $img['id'] ) ? (int) $img['id'] : 0,
					'url' => isset( $img['url'] ) && is_string( $img['url'] ) ? $img['url'] : '',
				];
			}

			if ( ! $images ) {
				continue;
			}

			$fields[] = [
				'kind'   => 'gallery',
				'key'    => $name,
				'label'  => isset( $control['label'] ) && $control['label'] ? (string) $control['label'] : self::humanize( $name ),
				'value'  => count( $images ),
				'images' => $images,
			];
		}

		return $fields;
	}

	/**
	 * Detect background images in atomic container styles.
	 *
	 * Atomic containers (e-flexbox, e-div-block) store background images
	 * in the styles tree, not in settings. The path is:
	 *   styles -> {style-id} -> variants -> [{variant}] -> props -> background
	 *     -> value -> background-overlay -> value -> [items]
	 *       -> background-image-overlay -> value -> image (Image_Prop_Type)
	 *
	 * @param array $node
	 * @return array
	 */
	private static function atomic_background_fields( array $node ) {
		$styles = isset( $node['styles'] ) && is_array( $node['styles'] ) ? $node['styles'] : [];
		$fields = [];

		foreach ( $styles as $style_id => $style ) {
			if ( ! isset( $style['variants'] ) || ! is_array( $style['variants'] ) ) {
				continue;
			}

			foreach ( $style['variants'] as $variant_index => $variant ) {
				if ( ! isset( $variant['props']['background'] ) ) {
					continue;
				}

				$bg = $variant['props']['background'];
				if ( ! isset( $bg['value']['background-overlay']['value'] ) || ! is_array( $bg['value']['background-overlay']['value'] ) ) {
					continue;
				}

				foreach ( $bg['value']['background-overlay']['value'] as $overlay_index => $overlay ) {
					if ( ! isset( $overlay['$$type'] ) || 'background-image-overlay' !== $overlay['$$type'] ) {
						continue;
					}
					if ( ! isset( $overlay['value']['image']['value']['src']['value'] ) ) {
						continue;
					}

					$src_value = $overlay['value']['image']['value']['src']['value'];
					$image_id  = 0;
					$image_url = '';

					if ( isset( $src_value['id']['value'] ) ) {
						$image_id = (int) $src_value['id']['value'];
					}
					if ( isset( $src_value['url'] ) && is_string( $src_value['url'] ) ) {
						$image_url = $src_value['url'];
					} elseif ( isset( $src_value['url']['value'] ) && is_string( $src_value['url']['value'] ) ) {
						$image_url = $src_value['url']['value'];
					}

					if ( ! $image_id && ! $image_url ) {
						continue;
					}

					$fields[] = [
						'kind'          => 'background',
						'label'         => __( 'Background Image', 'roman-inline-2' ),
						'value'         => $image_id,
						'key'           => 'background',
						'style_id'      => $style_id,
						'variant_index' => $variant_index,
						'overlay_index' => $overlay_index,
					];
				}
			}
		}

		return $fields;
	}

	private static function prop_key( $prop ) {
		if ( ! is_object( $prop ) ) {
			return '';
		}

		if ( $prop instanceof \Elementor\Modules\AtomicWidgets\PropTypes\Union_Prop_Type && method_exists( $prop, 'get_prop_types' ) ) {
			$inner_types = $prop->get_prop_types();
			foreach ( $inner_types as $inner ) {
				if ( is_object( $inner ) && method_exists( $inner, 'get_key' ) ) {
					try {
						$key = (string) $inner::get_key();
						if ( in_array( $key, [ 'html-v3', 'link', 'image', 'video-src', 'string' ], true ) ) {
							return $key;
						}
					} catch ( \Throwable $e ) {
						continue;
					}
				}
			}
		}

		if ( method_exists( $prop, 'get_key' ) ) {
			try {
				return (string) $prop::get_key();
			} catch ( \Throwable $e ) {
				return '';
			}
		}
		return '';
	}

	private static function atomic_html_value( array $settings, $key ) {
		if ( isset( $settings[ $key ]['value']['content']['value'] ) && is_string( $settings[ $key ]['value']['content']['value'] ) ) {
			return $settings[ $key ]['value']['content']['value'];
		}
		return '';
	}

	private static function atomic_link_url( array $settings, $key ) {
		if ( isset( $settings[ $key ]['value']['destination']['value'] ) && is_string( $settings[ $key ]['value']['destination']['value'] ) ) {
			return $settings[ $key ]['value']['destination']['value'];
		}
		return '';
	}

	private static function atomic_link_target( array $settings, $key ) {
		return ! empty( $settings[ $key ]['value']['isTargetBlank']['value'] );
	}

	private static function atomic_image_id( array $settings, $key ) {
		if ( isset( $settings[ $key ]['value']['src']['value']['id']['value'] ) ) {
			return (int) $settings[ $key ]['value']['src']['value']['id']['value'];
		}
		return 0;
	}

	private static function atomic_video_url( array $settings, $key ) {
		if ( isset( $settings[ $key ]['value']['url']['value'] ) && is_string( $settings[ $key ]['value']['url']['value'] ) ) {
			return $settings[ $key ]['value']['url']['value'];
		}
		return '';
	}

	private static function atomic_video_source_type( array $settings, $key ) {
		if ( isset( $settings[ $key ]['value']['id']['value'] ) && $settings[ $key ]['value']['id']['value'] ) {
			return 'media';
		}
		if ( isset( $settings[ $key ]['value']['url']['value'] ) && $settings[ $key ]['value']['url']['value'] ) {
			return 'url';
		}
		return 'media';
	}

	private static function atomic_string_value( array $settings, $key ) {
		if ( isset( $settings[ $key ]['value'] ) && is_string( $settings[ $key ]['value'] ) ) {
			return $settings[ $key ]['value'];
		}
		if ( isset( $settings[ $key ] ) && is_string( $settings[ $key ] ) ) {
			return $settings[ $key ];
		}
		return '';
	}

	private static function looks_like_video_url( $url ) {
		$patterns = [
			'youtube\.com',
			'youtu\.be',
			'vimeo\.com',
			'dailymotion\.com',
			'videopress\.com',
			'wistia\.com',
		];
		foreach ( $patterns as $pattern ) {
			if ( preg_match( '#https?://(?:www\.)?' . $pattern . '#i', $url ) ) {
				return true;
			}
		}
		return false;
	}

	/* --------------------------------------------------------------------- */
	/* Classic / 3rd-party                                                    */
	/* --------------------------------------------------------------------- */

	private static function classic_fields( array $node, $type, $instance ) {
		$fields = self::marker_fields( $node );

		// Detect classic video URL fields early so they aren't also picked up
		// by text introspection (e.g. youtube_url is a text control).
		$videos     = self::classic_video_fields( $node, $instance );
		$video_keys = [];
		foreach ( $videos as $video ) {
			$fields[]     = $video;
			$video_keys[] = $video['key'];
		}

		// Detect classic poster / image overlay fields.
		$posters = self::classic_poster_fields( $node, $instance );
		foreach ( $posters as $poster ) {
			$fields[] = $poster;
		}

		// Detect classic container/section background image.
		$bg_fields = self::classic_background_fields( $node, $type );
		foreach ( $bg_fields as $bg ) {
			$fields[] = $bg;
		}

		if ( empty( $fields ) && $instance ) {
			$fields = self::introspection_fields( $node, $instance, $video_keys );
		} elseif ( $instance && $video_keys ) {
			$extra = self::introspection_fields( $node, $instance, $video_keys );
			foreach ( $extra as $f ) {
				$fields[] = $f;
			}
		}

		$link = self::classic_link( $node );
		if ( $link ) {
			$fields[] = $link;
		}

		// Detect classic gallery fields (gallery control type).
		$gallery_fields = self::classic_gallery_fields( $node, $instance );
		$gallery_keys   = [];
		foreach ( $gallery_fields as $gf ) {
			$fields[]      = $gf;
			$gallery_keys[] = $gf['key'];
		}

		// Detect classic image fields (settings with {id, url} shape).
		// Pass gallery keys so individual gallery images aren't double-counted.
		$images = self::classic_image_fields( $node, $gallery_keys );
		foreach ( $images as $img ) {
			$fields[] = $img;
		}

		return array_values( $fields );
	}

	/**
	 * Detect classic image references in the settings tree.
	 *
	 * Classic Elementor stores images as { id, url, alt, ... } arrays.
	 * We walk the settings DFS to find each one, returning them in order
	 * with an ordinal index for the Nth-image addressing scheme.
	 *
	 * @param array $node
	 * @return array
	 */
	private static function classic_image_fields( array $node, array $exclude_keys = [] ) {
		$settings = isset( $node['settings'] ) && is_array( $node['settings'] ) ? $node['settings'] : [];
		$refs     = [];
		self::collect_classic_images( $settings, $refs, '', $exclude_keys );

		$fields = [];
		foreach ( $refs as $i => $ref ) {
			$fields[] = [
				'key'   => $ref['key'],
				'kind'  => 'image',
				'label' => self::humanize( $ref['key'] ),
				'value' => $ref['id'],
				'index' => $i,
			];
		}
		return $fields;
	}

	/**
	 * Recursively collect classic image references from a settings tree.
	 *
	 * @param mixed  $value
	 * @param array  $out   List of [ 'key' => string, 'id' => int ].
	 * @param string $parent_key  Key of the parent setting (for labeling).
	 */
	private static function collect_classic_images( $value, array &$out, $parent_key = '', array $exclude_keys = [] ) {
		if ( ! is_array( $value ) ) {
			return;
		}

		// Skip atomic image prop trees.
		if ( isset( $value['$$type'] ) ) {
			return;
		}

		// Skip gallery arrays — handled by classic_gallery_fields().
		if ( $parent_key && in_array( $parent_key, $exclude_keys, true ) ) {
			return;
		}

		// Detect classic image shape: { id, url } with no $$type.
		if ( array_key_exists( 'url', $value )
			&& is_string( $value['url'] )
			&& array_key_exists( 'id', $value )
			&& ! isset( $value['$$type'] ) ) {
			$out[] = [
				'key' => $parent_key ?: 'image',
				'id'  => (int) $value['id'],
			];
			return;
		}

		foreach ( $value as $k => $child ) {
			if ( is_array( $child ) ) {
				self::collect_classic_images( $child, $out, (string) $k, $exclude_keys );
			}
		}
	}

	private static function marker_fields( array $node ) {
		$html = Document::render_html( $node, true );
		if ( '' === trim( $html ) ) {
			return [];
		}

		$markers  = self::parse_markers( $html );
		$settings = isset( $node['settings'] ) && is_array( $node['settings'] ) ? $node['settings'] : [];
		$fields   = [];

		foreach ( $markers as $key => $marker ) {
			if ( false !== strpos( $key, '.' ) ) {
				continue;
			}
			$toolbar = $marker['toolbar'];
			$kind    = ( 'advanced' === $toolbar ) ? 'rich_text' : 'text';
			$value   = isset( $settings[ $key ] ) && is_string( $settings[ $key ] ) ? $settings[ $key ] : '';

			$fields[ $key ] = [
				'key'     => $key,
				'kind'    => $kind,
				'label'   => self::humanize( $key ),
				'value'   => $value,
				'match'   => [
					'tag'     => $marker['tag'],
					'classes' => $marker['classes'],
				],
			];
		}

		return $fields;
	}

	private static function parse_markers( $html ) {
		$markers = [];

		if ( ! class_exists( '\DOMDocument' ) ) {
			return $markers;
		}

		$dom  = new \DOMDocument();
		$prev = libxml_use_internal_errors( true );
		$dom->loadHTML(
			'<?xml encoding="utf-8" ?><div id="ri2-root">' . $html . '</div>',
			LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
		);
		libxml_clear_errors();
		libxml_use_internal_errors( $prev );

		$xpath = new \DOMXPath( $dom );
		$nodes = $xpath->query( '//*[@data-elementor-setting-key]' );
		if ( ! $nodes ) {
			return $markers;
		}

		foreach ( $nodes as $el ) {
			/** @var \DOMElement $el */
			$key = $el->getAttribute( 'data-elementor-setting-key' );
			if ( '' === $key || isset( $markers[ $key ] ) ) {
				continue;
			}
			$classes = array_values(
				array_filter(
					preg_split( '/\s+/', trim( (string) $el->getAttribute( 'class' ) ) ),
					function ( $c ) {
						return '' !== $c && 'elementor-inline-editing' !== $c;
					}
				)
			);
			$markers[ $key ] = [
				'tag'     => strtolower( $el->tagName ),
				'classes' => $classes,
				'toolbar' => $el->getAttribute( 'data-elementor-inline-editing-toolbar' ) ?: 'basic',
			];
		}

		return $markers;
	}

	private static function introspection_fields( array $node, $instance, array $exclude_keys = [] ) {
		$fields   = [];
		$settings = isset( $node['settings'] ) && is_array( $node['settings'] ) ? $node['settings'] : [];

		try {
			$controls = $instance->get_controls();
		} catch ( \Throwable $e ) {
			return $fields;
		}
		if ( ! is_array( $controls ) ) {
			return $fields;
		}

		foreach ( $controls as $control ) {
			$tab = isset( $control['tab'] ) ? strtolower( (string) $control['tab'] ) : 'content';
			if ( 'content' !== $tab ) {
				continue;
			}
			$name  = isset( $control['name'] ) ? (string) $control['name'] : '';
			$ctype = isset( $control['type'] ) ? (string) $control['type'] : '';
			if ( '' === $name ) {
				continue;
			}

			// Skip keys already claimed by video detection.
			if ( in_array( $name, $exclude_keys, true ) ) {
				continue;
			}

			if ( 'wysiwyg' === $ctype ) {
				$kind = 'rich_text';
			} elseif ( in_array( $ctype, [ 'text', 'textarea' ], true ) ) {
				$kind = 'text';
			} else {
				continue;
			}

			$value = isset( $settings[ $name ] ) && is_string( $settings[ $name ] ) ? $settings[ $name ] : '';

			$fields[ $name ] = [
				'key'     => $name,
				'kind'    => $kind,
				'label'   => isset( $control['label'] ) ? (string) $control['label'] : self::humanize( $name ),
				'value'   => $value,
				'popover' => true,
			];
		}

		return $fields;
	}

	private static function classic_link( array $node ) {
		$settings = isset( $node['settings'] ) && is_array( $node['settings'] ) ? $node['settings'] : [];

		if ( isset( $settings['link'] ) && is_array( $settings['link'] ) && array_key_exists( 'url', $settings['link'] ) ) {
			return [
				'key'          => 'link',
				'kind'         => 'link',
				'label'        => __( 'Link', 'roman-inline-2' ),
				'value'        => is_string( $settings['link']['url'] ) ? $settings['link']['url'] : '',
				'target_blank' => ! empty( $settings['link']['is_external'] ),
			];
		}

		return null;
	}

	/* --------------------------------------------------------------------- */
	/* Classic video detection                                                */
	/* --------------------------------------------------------------------- */

	/**
	 * Generic video URL detection for classic/third-party widgets.
	 *
	 * Strategy (no widget-specific code):
	 *   1. If the widget has a `video_type` select control, look for a matching
	 *      `{type}_url` text control (e.g. youtube_url, vimeo_url). This is the
	 *      pattern used by Elementor's core Video widget and many 3rd-party ones.
	 *   2. Otherwise, scan all content-tab text/url controls whose current value
	 *      looks like a video URL (matches known video host patterns).
	 *
	 * @param array       $node
	 * @param object|null $instance
	 * @return array
	 */
	private static function classic_video_fields( array $node, $instance ) {
		$settings = isset( $node['settings'] ) && is_array( $node['settings'] ) ? $node['settings'] : [];
		$fields   = [];

		$controls = [];
		if ( $instance ) {
			try {
				$controls = $instance->get_controls();
			} catch ( \Throwable $e ) {
				$controls = [];
			}
		}

		// Strategy 1: video_type select + {type}_url pattern.
		$video_type = isset( $settings['video_type'] ) ? (string) $settings['video_type'] : '';
		if ( $video_type ) {
			if ( 'hosted' === $video_type ) {
				$insert_url = ! empty( $settings['insert_url'] ) && 'yes' === $settings['insert_url'];
				if ( $insert_url ) {
					$url = isset( $settings['external_url'] ) ? self::extract_url_value( $settings['external_url'] ) : '';
					$fields[] = [
						'key'         => 'external_url',
						'kind'        => 'video',
						'label'       => __( 'Video URL', 'roman-inline-2' ),
						'value'       => $url,
						'source_type' => 'url',
						'popover'     => true,
					];
					return $fields;
				} else {
					$media = isset( $settings['hosted_url'] ) ? $settings['hosted_url'] : [];
					$url   = is_array( $media ) && isset( $media['url'] ) ? (string) $media['url'] : '';
					$id    = is_array( $media ) && isset( $media['id'] ) ? (int) $media['id'] : 0;
					$fields[] = [
						'key'         => 'hosted_url',
						'kind'        => 'video',
						'label'       => __( 'Self Hosted Video', 'roman-inline-2' ),
						'value'       => $url,
						'source_type' => 'media',
						'popover'     => true,
					];
					return $fields;
				}
			}

			$url_key = $video_type . '_url';
			if ( isset( $settings[ $url_key ] ) ) {
				$value = $settings[ $url_key ];
				$url   = is_string( $value ) ? $value : self::extract_url_value( $value );
				if ( $url ) {
					$label = self::humanize( $video_type ) . ' URL';
					if ( is_array( $controls ) ) {
						foreach ( $controls as $ctrl ) {
							if ( isset( $ctrl['name'] ) && $ctrl['name'] === $url_key && ! empty( $ctrl['label'] ) ) {
								$label = (string) $ctrl['label'];
								break;
							}
						}
					}
					$fields[] = [
						'key'         => $url_key,
						'kind'        => 'video',
						'label'       => $label,
						'value'       => $url,
						'source_type' => 'url',
						'popover'     => true,
					];
					return $fields;
				}
			}
		}

		// Strategy 2: scan content-tab text controls for video-looking URLs.
		if ( ! is_array( $controls ) ) {
			return $fields;
		}

		$video_patterns = [
			'youtube\.com',
			'youtu\.be',
			'vimeo\.com',
			'dailymotion\.com',
			'videopress\.com',
			'wistia\.com',
		];

		foreach ( $controls as $control ) {
			$tab = isset( $control['tab'] ) ? strtolower( (string) $control['tab'] ) : 'content';
			if ( 'content' !== $tab ) {
				continue;
			}
			$name  = isset( $control['name'] ) ? (string) $control['name'] : '';
			$ctype = isset( $control['type'] ) ? (string) $control['type'] : '';
			if ( '' === $name || ! in_array( $ctype, [ 'text', 'url' ], true ) ) {
				continue;
			}

			$value = isset( $settings[ $name ] ) ? $settings[ $name ] : '';
			$url   = is_string( $value ) ? $value : self::extract_url_value( $value );
			if ( '' === $url ) {
				continue;
			}

			$matched = false;
			foreach ( $video_patterns as $pattern ) {
				if ( preg_match( '#https?://(?:www\.)?' . $pattern . '#i', $url ) ) {
					$matched = true;
					break;
				}
			}

			if ( $matched ) {
				$label = isset( $control['label'] ) ? (string) $control['label'] : self::humanize( $name );
				$fields[] = [
					'key'         => $name,
					'kind'        => 'video',
					'label'       => $label,
					'value'       => $url,
					'source_type' => 'url',
					'popover'     => true,
				];
			}
		}

		return $fields;
	}

	/* --------------------------------------------------------------------- */
	/* Classic poster / overlay image detection                               */
	/* --------------------------------------------------------------------- */

	/**
	 * Detect classic poster and image overlay fields.
	 *
	 * @param array       $node
	 * @param object|null $instance
	 * @return array
	 */
	private static function classic_poster_fields( array $node, $instance ) {
		$settings = isset( $node['settings'] ) && is_array( $node['settings'] ) ? $node['settings'] : [];
		$fields   = [];

		// Poster (hosted video).
		if ( isset( $settings['poster'] ) && is_array( $settings['poster'] ) ) {
			$poster = $settings['poster'];
			$url    = isset( $poster['url'] ) ? (string) $poster['url'] : '';
			$id     = isset( $poster['id'] ) ? (int) $poster['id'] : 0;
			if ( $url || $id ) {
				$fields[] = [
					'key'   => 'poster',
					'kind'  => 'poster',
					'label' => __( 'Poster Image', 'roman-inline-2' ),
					'value' => $id,
				];
			}
		}

		// Image overlay (external videos, when show_image_overlay is 'yes').
		if ( isset( $settings['show_image_overlay'] ) && 'yes' === $settings['show_image_overlay'] ) {
			if ( isset( $settings['image_overlay'] ) && is_array( $settings['image_overlay'] ) ) {
				$overlay = $settings['image_overlay'];
				$url     = isset( $overlay['url'] ) ? (string) $overlay['url'] : '';
				$id      = isset( $overlay['id'] ) ? (int) $overlay['id'] : 0;
				if ( $url || $id ) {
					$fields[] = [
						'key'   => 'image_overlay',
						'kind'  => 'poster',
						'label' => __( 'Overlay Image', 'roman-inline-2' ),
						'value' => $id,
					];
				}
			}
		}

		return $fields;
	}

	/**
	 * Extract a URL string from a value that may be a plain string or an
	 * Elementor URL control array ({ url, is_external, nofollow }).
	 *
	 * @param mixed $value
	 * @return string
	 */
	private static function extract_url_value( $value ) {
		if ( is_string( $value ) ) {
			return $value;
		}
		if ( is_array( $value ) && isset( $value['url'] ) && is_string( $value['url'] ) ) {
			return (string) $value['url'];
		}
		return '';
	}

	/* --------------------------------------------------------------------- */
	/* Helpers                                                                */
	/* --------------------------------------------------------------------- */

	private static function humanize( $key ) {
		$key = preg_replace( '/^_+/', '', (string) $key );
		$key = str_replace( [ '_', '-' ], ' ', $key );
		return ucwords( trim( $key ) );
	}
}
