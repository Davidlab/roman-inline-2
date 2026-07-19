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

		if ( empty( $fields ) && $instance ) {
			$fields = self::introspection_fields( $node, $instance );
		}

		$link = self::classic_link( $node );
		if ( $link ) {
			$fields[] = $link;
		}

		return array_values( $fields );
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

	private static function introspection_fields( array $node, $instance ) {
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
	/* Helpers                                                                */
	/* --------------------------------------------------------------------- */

	private static function humanize( $key ) {
		$key = preg_replace( '/^_+/', '', (string) $key );
		$key = str_replace( [ '_', '-' ], ' ', $key );
		return ucwords( trim( $key ) );
	}
}
