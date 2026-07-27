<?php
/**
 * REST API for the front-end editor.
 *
 * Namespace: roman-inline-2/v1
 *   GET  /fields  ?post_id&element_id      -> editable fields for an element
 *   POST /text     post_id,element_id,key,value,kind
 *   POST /link     post_id,element_id,key,url,target_blank
 *   POST /image    post_id,element_id,key,attachment_id
 *   POST /video    post_id,element_id,key,attachment_id|url,source_type
 *   POST /poster   post_id,element_id,key,attachment_id
 *   POST /background post_id,element_id,attachment_id,style_id,variant_index,overlay_index
 *   POST /gallery   post_id,element_id,key,action,attachment_id,index
 *   GET  /render   ?post_id&element_id     -> freshly rendered widget HTML
 *
 * @package RomanInline2
 */

namespace RomanInline2;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Rest_Controller {

	const NS = 'roman-inline-2/v1';

	public static function register() {
		register_rest_route(
			self::NS,
			'/fields',
			[
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => [ __CLASS__, 'get_fields' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
				'args'                => [
					'post_id'    => [ 'required' => true ],
					'element_id' => [ 'required' => true ],
				],
			]
		);

		register_rest_route(
			self::NS,
			'/text',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'save_text' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/link',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'save_link' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/image',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'save_image' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/video',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'save_video' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/poster',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'save_poster' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/background',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'save_background' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/gallery',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'save_gallery' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/pro-gallery',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'save_pro_gallery' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/icon',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'save_icon' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/setting',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'save_setting' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/attachment-meta',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'save_attachment_meta' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/repeater',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'save_repeater_item' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/delete-repeater-item',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'delete_repeater_item' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/add-repeater-item',
			[
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => [ __CLASS__, 'add_repeater_item' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
			]
		);

		register_rest_route(
			self::NS,
			'/render',
			[
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => [ __CLASS__, 'render_widget' ],
				'permission_callback' => [ __CLASS__, 'can_edit' ],
				'args'                => [
					'post_id'    => [ 'required' => true ],
					'element_id' => [ 'required' => true ],
				],
			]
		);
	}

	/* --------------------------------------------------------------------- */
	/* Permission                                                             */
	/* --------------------------------------------------------------------- */

	public static function can_edit( $request ) {
		$post_id = (int) $request->get_param( 'post_id' );
		if ( ! $post_id ) {
			return new \WP_Error( 'ri2_no_post', __( 'Missing post id.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}
		if ( ! Plugin::user_can_edit( $post_id ) ) {
			return new \WP_Error( 'ri2_forbidden', __( 'You are not allowed to edit this content.', 'roman-inline-2' ), [ 'status' => 403 ] );
		}
		return true;
	}

	/* --------------------------------------------------------------------- */
	/* Handlers                                                               */
	/* --------------------------------------------------------------------- */

	public static function get_fields( $request ) {
		$post_id    = (int) $request->get_param( 'post_id' );
		$element_id = (string) $request->get_param( 'element_id' );

		$result = Field_Resolver::resolve( $post_id, $element_id );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return rest_ensure_response( $result );
	}

	public static function render_widget( $request ) {
		$post_id    = (int) $request->get_param( 'post_id' );
		$element_id = (string) $request->get_param( 'element_id' );

		$document = new Document( $post_id );
		$html     = $document->render_widget( $element_id );
		if ( is_wp_error( $html ) ) {
			return $html;
		}
		return rest_ensure_response( [ 'html' => $html ] );
	}

	public static function save_text( $request ) {
		$post_id    = (int) $request->get_param( 'post_id' );
		$element_id = (string) $request->get_param( 'element_id' );
		$key        = (string) $request->get_param( 'key' );
		$value      = (string) $request->get_param( 'value' );
		$kind       = (string) $request->get_param( 'kind' );

		$field = self::authorize_field( $post_id, $element_id, $key, [ 'text', 'rich_text' ] );
		if ( is_wp_error( $field ) ) {
			return $field;
		}

		$resolved_kind = $kind ?: $field['kind'];
		$result = Saver::save_text( $post_id, $element_id, $key, $value, $field['is_atomic'], $resolved_kind );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	public static function save_link( $request ) {
		$post_id      = (int) $request->get_param( 'post_id' );
		$element_id   = (string) $request->get_param( 'element_id' );
		$key          = (string) $request->get_param( 'key' );
		$url          = (string) $request->get_param( 'url' );
		$target_blank = filter_var( $request->get_param( 'target_blank' ), FILTER_VALIDATE_BOOLEAN );

		if ( '' === $key ) {
			$key = 'link';
		}

		$field = self::authorize_field( $post_id, $element_id, $key, [ 'link' ] );
		if ( is_wp_error( $field ) ) {
			return $field;
		}

		$result = Saver::save_link( $post_id, $element_id, $key, $url, $target_blank, $field['is_atomic'] );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	public static function save_image( $request ) {
		$post_id       = (int) $request->get_param( 'post_id' );
		$element_id    = (string) $request->get_param( 'element_id' );
		$key           = (string) $request->get_param( 'key' );
		$attachment_id = (int) $request->get_param( 'attachment_id' );

		$field = self::authorize_field( $post_id, $element_id, $key, [ 'image' ] );
		if ( is_wp_error( $field ) ) {
			return $field;
		}

		$result = Saver::save_image( $post_id, $element_id, $key, $attachment_id, $field['is_atomic'] );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	public static function save_video( $request ) {
		$post_id       = (int) $request->get_param( 'post_id' );
		$element_id    = (string) $request->get_param( 'element_id' );
		$key           = (string) $request->get_param( 'key' );
		$attachment_id = (int) $request->get_param( 'attachment_id' );
		$url           = (string) $request->get_param( 'url' );
		$source_type   = (string) $request->get_param( 'source_type' );

		$field = self::authorize_field( $post_id, $element_id, $key, [ 'video' ] );
		if ( is_wp_error( $field ) ) {
			return $field;
		}

		$result = Saver::save_video( $post_id, $element_id, $key, $attachment_id, $url, $field['is_atomic'], $source_type );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	public static function save_poster( $request ) {
		$post_id       = (int) $request->get_param( 'post_id' );
		$element_id    = (string) $request->get_param( 'element_id' );
		$key           = (string) $request->get_param( 'key' );
		$attachment_id = (int) $request->get_param( 'attachment_id' );

		$field = self::authorize_field( $post_id, $element_id, $key, [ 'poster' ] );
		if ( is_wp_error( $field ) ) {
			return $field;
		}

		$result = Saver::save_poster( $post_id, $element_id, $key, $attachment_id, $field['is_atomic'] );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	public static function save_background( $request ) {
		$post_id       = (int) $request->get_param( 'post_id' );
		$element_id    = (string) $request->get_param( 'element_id' );
		$attachment_id = (int) $request->get_param( 'attachment_id' );
		$style_id      = (string) $request->get_param( 'style_id' );
		$variant_index = (int) $request->get_param( 'variant_index' );
		$overlay_index = (int) $request->get_param( 'overlay_index' );

		// Validate that the element has a background field.
		$resolved = Field_Resolver::resolve( $post_id, $element_id );
		if ( is_wp_error( $resolved ) ) {
			return $resolved;
		}
		$has_bg = false;
		foreach ( $resolved['fields'] as $field ) {
			if ( 'background' === $field['kind'] ) {
				$has_bg = true;
				break;
			}
		}
		if ( ! $has_bg ) {
			return new \WP_Error( 'ri2_no_background', __( 'This element has no editable background image.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		$is_atomic = ! empty( $resolved['is_atomic'] );
		$result = Saver::save_background( $post_id, $element_id, $attachment_id, $is_atomic, $style_id, $variant_index, $overlay_index );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	/* --------------------------------------------------------------------- */
	/* Authorization helper                                                   */
	/* --------------------------------------------------------------------- */

	public static function save_gallery( $request ) {
		$post_id       = (int) $request->get_param( 'post_id' );
		$element_id    = (string) $request->get_param( 'element_id' );
		$key           = (string) $request->get_param( 'key' );
		$action        = (string) $request->get_param( 'action' );
		$attachment_id = (int) $request->get_param( 'attachment_id' );
		$index         = (int) $request->get_param( 'index' );

		$field = self::authorize_field( $post_id, $element_id, $key, [ 'gallery' ] );
		if ( is_wp_error( $field ) ) {
			return $field;
		}

		$result = Saver::save_gallery( $post_id, $element_id, $key, $action, $attachment_id, $index );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	public static function save_pro_gallery( $request ) {
		$post_id           = (int) $request->get_param( 'post_id' );
		$element_id        = (string) $request->get_param( 'element_id' );
		$key               = (string) $request->get_param( 'key' );
		$action            = (string) $request->get_param( 'action' );
		$attachment_id     = (int) $request->get_param( 'attachment_id' );
		$old_attachment_id = (int) $request->get_param( 'old_attachment_id' );
		$gallery_index     = (int) $request->get_param( 'gallery_index' );

		$field = self::authorize_field( $post_id, $element_id, $key, [ 'pro-gallery', 'pro-gallery-multi' ] );
		if ( is_wp_error( $field ) ) {
			return $field;
		}

		$result = Saver::save_pro_gallery( $post_id, $element_id, $key, $action, $attachment_id, $old_attachment_id, $gallery_index );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	public static function save_attachment_meta( $request ) {
		$attachment_id = (int) $request->get_param( 'attachment_id' );
		$field         = (string) $request->get_param( 'field' );
		$value         = (string) $request->get_param( 'value' );

		$result = Saver::save_attachment_meta( $attachment_id, $field, $value );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	public static function save_repeater_item( $request ) {
		$post_id    = (int) $request->get_param( 'post_id' );
		$element_id = (string) $request->get_param( 'element_id' );
		$key        = (string) $request->get_param( 'key' );
		$index      = (int) $request->get_param( 'index' );
		$sub_field  = (string) $request->get_param( 'sub_field' );
		$value      = $request->get_param( 'value' );

		$field = self::authorize_field( $post_id, $element_id, $key, [ 'repeater', 'pro-gallery-multi', 'icon-list', 'social-icons' ] );
		if ( is_wp_error( $field ) ) {
			return $field;
		}

		$result = Saver::save_repeater_item( $post_id, $element_id, $key, $index, $sub_field, $value );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	public static function delete_repeater_item( $request ) {
		$post_id    = (int) $request->get_param( 'post_id' );
		$element_id = (string) $request->get_param( 'element_id' );
		$key        = (string) $request->get_param( 'key' );
		$index      = (int) $request->get_param( 'index' );

		$field = self::authorize_field( $post_id, $element_id, $key, [ 'repeater', 'icon-list', 'social-icons' ] );
		if ( is_wp_error( $field ) ) {
			return $field;
		}

		$result = Saver::delete_repeater_item( $post_id, $element_id, $key, $index );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	public static function add_repeater_item( $request ) {
		$post_id      = (int) $request->get_param( 'post_id' );
		$element_id   = (string) $request->get_param( 'element_id' );
		$key          = (string) $request->get_param( 'key' );
		$kind         = (string) $request->get_param( 'kind' );
		$insert_index = $request->get_param( 'insert_index' );
		$insert_index = ( null !== $insert_index ) ? (int) $insert_index : null;

		$field = self::authorize_field( $post_id, $element_id, $key, [ 'repeater', 'icon-list', 'social-icons' ] );
		if ( is_wp_error( $field ) ) {
			return $field;
		}

		$resolved_kind = $kind ?: $field['kind'];
		$result = Saver::add_repeater_item( $post_id, $element_id, $key, $resolved_kind, $insert_index );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	public static function save_icon( $request ) {
		$post_id    = (int) $request->get_param( 'post_id' );
		$element_id = (string) $request->get_param( 'element_id' );
		$key        = (string) $request->get_param( 'key' );
		$value      = (string) $request->get_param( 'value' );
		$library    = (string) $request->get_param( 'library' );

		$field = self::authorize_field( $post_id, $element_id, $key, [ 'icon' ] );
		if ( is_wp_error( $field ) ) {
			return $field;
		}

		$result = Saver::save_icon( $post_id, $element_id, $key, $value, $library );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	public static function save_setting( $request ) {
		$post_id    = (int) $request->get_param( 'post_id' );
		$element_id = (string) $request->get_param( 'element_id' );
		$key        = (string) $request->get_param( 'key' );
		$value      = (string) $request->get_param( 'value' );

		if ( '' === $key ) {
			return new \WP_Error( 'ri2_no_key', __( 'Missing key.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		// Verify the key is a real control on this widget instance.
		$document = new Document( $post_id );
		$read     = $document->read_node( $element_id );
		if ( is_wp_error( $read ) ) {
			return $read;
		}

		$instance = Document::create_instance( $read['node'] );
		if ( ! $instance ) {
			return new \WP_Error( 'ri2_no_instance', __( 'Cannot create widget instance.', 'roman-inline-2' ), [ 'status' => 500 ] );
		}

		$valid = false;
		try {
			$controls = $instance->get_controls();
			if ( is_array( $controls ) ) {
				foreach ( $controls as $control ) {
					if ( isset( $control['name'] ) && $control['name'] === $key ) {
						$valid = true;
						break;
					}
				}
			}
		} catch ( \Throwable $e ) {
			// ignore
		}

		if ( ! $valid ) {
			return new \WP_Error( 'ri2_invalid_setting', __( 'That setting is not editable.', 'roman-inline-2' ), [ 'status' => 400 ] );
		}

		$result = Saver::save_setting( $post_id, $element_id, $key, $value );
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	private static function authorize_field( $post_id, $element_id, $key, array $allowed_kinds ) {
		$resolved = Field_Resolver::resolve( $post_id, $element_id );
		if ( is_wp_error( $resolved ) ) {
			return $resolved;
		}

		// First pass: exact key + kind match.
		foreach ( $resolved['fields'] as $field ) {
			if ( $field['key'] === $key && in_array( $field['kind'], $allowed_kinds, true ) ) {
				return [
					'is_atomic' => ! empty( $resolved['is_atomic'] ),
					'kind'      => $field['kind'],
					'field'     => $field,
				];
			}
		}

		// Second pass: kind-only match (for classic video where the key
		// may have changed after a source-type switch).
		foreach ( $resolved['fields'] as $field ) {
			if ( in_array( $field['kind'], $allowed_kinds, true ) ) {
				return [
					'is_atomic' => ! empty( $resolved['is_atomic'] ),
					'kind'      => $field['kind'],
					'field'     => $field,
				];
			}
		}

		return new \WP_Error(
			'ri2_field_not_editable',
			__( 'That field is not editable.', 'roman-inline-2' ),
			[ 'status' => 400 ]
		);
	}
}
