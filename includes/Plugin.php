<?php
/**
 * Main plugin orchestrator: wires hooks, the admin-bar toggle, front-end
 * asset loading, and centralises the "can this user edit?" decision.
 *
 * @package RomanInline2
 */

namespace RomanInline2;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Plugin {

	/** @var Plugin */
	private static $instance;

	/** @var array Handler scripts to enqueue (type -> relative path). */
	private $handlers = [];

	public static function instance() {
		if ( ! isset( self::$instance ) ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'rest_api_init', [ Rest_Controller::class, 'register' ] );
		add_action( 'admin_bar_menu', [ $this, 'admin_bar_toggle' ], 100 );
		add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_assets' ] );
		add_filter( 'elementor/widget/render_content', [ $this, 'wrap_atomic_widget' ], 10, 2 );

		// Register built-in atomic (V4) handlers.
		$this->register_handler( 'e-heading', 'handlers/atomic/heading.js' );
		$this->register_handler( 'e-paragraph', 'handlers/atomic/paragraph.js' );
		$this->register_handler( 'e-image', 'handlers/atomic/image.js' );
		$this->register_handler( 'e-self-hosted-video', 'handlers/atomic/video.js' );
		$this->register_handler( 'e-youtube', 'handlers/atomic/youtube.js' );
		$this->register_handler( 'e-flexbox', 'handlers/atomic/background.js' );
		$this->register_handler( 'e-div-block', 'handlers/atomic/background.js' );

		// Register built-in classic widget handlers.
		$this->register_handler( 'heading', 'handlers/classic/heading.js' );
		$this->register_handler( 'image', 'handlers/classic/image.js' );
		$this->register_handler( 'text-editor', 'handlers/classic/text.js' );
		$this->register_handler( 'video', 'handlers/classic/video.js' );
		$this->register_handler( 'google_maps', 'handlers/classic/google-maps.js' );
		$this->register_handler( 'image-gallery', 'handlers/classic/gallery.js' );
		$this->register_handler( 'image-carousel', 'handlers/classic/gallery.js' );
		$this->register_handler( 'container', 'handlers/classic/background.js' );
		$this->register_handler( 'section', 'handlers/classic/background.js' );

		// Allow 3rd-party code to register custom handlers.
		$this->handlers = apply_filters( 'roman_inline_2_handlers', $this->handlers );
	}

	/**
	 * Register a JS handler for a widget type.
	 *
	 * @param string $widget_type e.g. 'e-heading', 'e-image', or a classic widgetType.
	 * @param string $js_path     Relative path from the plugin's assets/js/ directory.
	 */
	public function register_handler( $widget_type, $js_path ) {
		$this->handlers[ $widget_type ] = $js_path;
	}

	/**
	 * Atomic widgets (V4) have an empty before_render(), so their output
	 * lacks the data-e-type / data-id wrapper attributes. This wraps atomic
	 * widget content in a div with those attributes so the frontend JS can
	 * locate the widget element.
	 *
	 * @param string                 $content
	 * @param \Elementor\Widget_Base $widget
	 * @return string
	 */
	public function wrap_atomic_widget( $content, $widget ) {
		if ( ! $content || ! method_exists( $widget, 'get_type' ) ) {
			return $content;
		}
		if ( ! Document::is_atomic( $widget ) ) {
			return $content;
		}
		$type = $widget->get_type();
		$id   = $widget->get_id();
		if ( ! $type || ! $id ) {
			return $content;
		}

		if ( preg_match( '/^\s*<[^>]+\sdata-e-type=/i', $content ) ) {
			return $content;
		}

		return sprintf(
			'<div data-e-type="%s" data-id="%s" class="elementor-widget elementor-widget-%s">%s</div>',
			esc_attr( $type ),
			esc_attr( $id ),
			esc_attr( $widget->get_name() ),
			$content
		);
	}

	/**
	 * Can the current user inline-edit this post? Filterable.
	 *
	 * @param int $post_id
	 * @return bool
	 */
	public static function user_can_edit( $post_id = 0 ) {
		$can = is_user_logged_in() && current_user_can( Capabilities::CAP );
		if ( $post_id ) {
			$can = $can && current_user_can( 'edit_post', $post_id );
		}
		return (bool) apply_filters( 'roman_inline_2_user_can_edit', $can, $post_id );
	}

	/**
	 * Was this post built with Elementor?
	 *
	 * @param int $post_id
	 * @return bool
	 */
	public static function is_elementor_post( $post_id ) {
		if ( ! $post_id ) {
			return false;
		}
		if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->documents ) ) {
			$document = \Elementor\Plugin::$instance->documents->get( $post_id );
			if ( $document && method_exists( $document, 'is_built_with_elementor' ) ) {
				return (bool) $document->is_built_with_elementor();
			}
		}
		return (bool) get_post_meta( $post_id, '_elementor_edit_mode', true );
	}

	/**
	 * Is the current request a front-end view of an editable Elementor post?
	 *
	 * @return int Post id when eligible, 0 otherwise.
	 */
	private function eligible_post_id() {
		if ( is_admin() || ! is_singular() ) {
			return 0;
		}
		if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->preview )
			&& method_exists( \Elementor\Plugin::$instance->preview, 'is_preview_mode' )
			&& \Elementor\Plugin::$instance->preview->is_preview_mode() ) {
			return 0;
		}
		$post_id = get_queried_object_id();
		if ( ! self::is_elementor_post( $post_id ) || ! self::user_can_edit( $post_id ) ) {
			return 0;
		}
		return (int) $post_id;
	}

	public function admin_bar_toggle( $bar ) {
		if ( ! $this->eligible_post_id() ) {
			return;
		}
		$bar->add_node(
			[
				'id'    => 'roman-inline-2-toggle',
				'title' => '<span class="ab-icon dashicons dashicons-edit-page" style="top:2px;"></span>' . esc_html__( 'Roman Inline 2', 'roman-inline-2' ),
				'href'  => '#',
				'meta'  => [
					'class'   => 'roman-inline-2-toggle',
					'onclick' => 'return false;',
				],
			]
		);
	}

	public function enqueue_assets() {
		$post_id = $this->eligible_post_id();
		if ( ! $post_id ) {
			return;
		}

		wp_enqueue_style( 'dashicons' );
		wp_enqueue_media();

		wp_enqueue_style(
			'roman-inline-2',
			ROMAN_INLINE_2_URL . 'assets/css/roman-inline-2.css',
			[],
			filemtime( ROMAN_INLINE_2_PATH . 'assets/css/roman-inline-2.css' )
		);

		// Core script — loaded first, handlers depend on it.
		wp_enqueue_script(
			'roman-inline-2-core',
			ROMAN_INLINE_2_URL . 'assets/js/core.js',
			[ 'wp-api-fetch', 'wp-i18n', 'jquery' ],
			filemtime( ROMAN_INLINE_2_PATH . 'assets/js/core.js' ),
			true
		);

		// Enqueue each unique handler script (deduped by path).
		$enqueued_paths = [];
		foreach ( $this->handlers as $type => $path ) {
			if ( isset( $enqueued_paths[ $path ] ) ) {
				continue;
			}
			$enqueued_paths[ $path ] = true;
			$handle = 'roman-inline-2-' . sanitize_key( str_replace( [ '/', '\\' ], '-', dirname( $path ) ) . '-' . basename( $path, '.js' ) );
			wp_enqueue_script(
				$handle,
				ROMAN_INLINE_2_URL . 'assets/js/' . $path,
				[ 'roman-inline-2-core' ],
				filemtime( ROMAN_INLINE_2_PATH . 'assets/js/' . $path ),
				true
			);
		}

		wp_localize_script(
			'roman-inline-2-core',
			'romanInline2',
			[
				'restRoot' => esc_url_raw( rest_url( Rest_Controller::NS . '/' ) ),
				'nonce'    => wp_create_nonce( 'wp_rest' ),
				'postId'   => $post_id,
				'handlers' => array_keys( $this->handlers ),
				'i18n'     => [
					'editing'    => __( 'Roman Inline 2 — editing', 'roman-inline-2' ),
					'exit'       => __( 'Exit', 'roman-inline-2' ),
					'saving'     => __( 'Saving…', 'roman-inline-2' ),
					'saved'      => __( 'Saved', 'roman-inline-2' ),
					'saveFailed' => __( 'Save failed', 'roman-inline-2' ),
					'bold'       => __( 'Bold', 'roman-inline-2' ),
					'italic'     => __( 'Italic', 'roman-inline-2' ),
					'link'       => __( 'Link', 'roman-inline-2' ),
					'unlink'     => __( 'Remove link', 'roman-inline-2' ),
					'done'       => __( 'Done', 'roman-inline-2' ),
					'cancel'     => __( 'Cancel', 'roman-inline-2' ),
					'replaceImg' => __( 'Replace image', 'roman-inline-2' ),
					'chooseImg'  => __( 'Choose image', 'roman-inline-2' ),
					'newTab'     => __( 'Open in new tab', 'roman-inline-2' ),
					'nothingEditable' => __( 'Nothing editable here', 'roman-inline-2' ),
					'chooseVideo'  => __( 'Choose video', 'roman-inline-2' ),
					'editVideo'    => __( 'Edit video', 'roman-inline-2' ),
					'changeBg'     => __( 'Change background', 'roman-inline-2' ),
					'changeImage'  => __( 'Change Image', 'roman-inline-2' ),
					],
			]
		);
	}
}
