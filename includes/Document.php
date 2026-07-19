<?php
/**
 * Thin wrapper around an Elementor document's element tree.
 *
 * Responsible for: locating a node by id, mutating it in place and persisting,
 * reading a node read-only, classifying it (atomic vs classic), and rendering a
 * single element to HTML.
 *
 * @package RomanInline2
 */

namespace RomanInline2;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Document {

	/** @var int */
	private $post_id;

	/** @var \Elementor\Core\Base\Document|null */
	private $document;

	public function __construct( $post_id ) {
		$this->post_id = (int) $post_id;
	}

	/**
	 * @return \Elementor\Core\Base\Document|\WP_Error
	 */
	public function get() {
		if ( $this->document ) {
			return $this->document;
		}
		if ( ! class_exists( '\Elementor\Plugin' ) ) {
			return new \WP_Error( 'ri2_no_elementor', __( 'Elementor is not active.', 'roman-inline-2' ), [ 'status' => 500 ] );
		}
		$document = \Elementor\Plugin::$instance->documents->get( $this->post_id );
		if ( ! $document ) {
			return new \WP_Error( 'ri2_no_document', __( 'Elementor document not found.', 'roman-inline-2' ), [ 'status' => 404 ] );
		}
		$this->document = $document;
		return $document;
	}

	/**
	 * Read a single node (deep copy) by element id, with its resolved type.
	 *
	 * Searches the current post's document first, then falls back to all
	 * other Elementor documents (Theme Builder templates, popups, etc.).
	 *
	 * @param string $element_id
	 * @return array|\WP_Error { node: array, type: string, post_id: int }
	 */
	public function read_node( $element_id ) {
		$document = $this->get();
		if ( is_wp_error( $document ) ) {
			return $document;
		}
		$elements = $document->get_elements_data();
		$node     = self::find( $elements, $element_id );
		if ( null !== $node ) {
			return [
				'node'    => $node,
				'type'    => self::node_type( $node ),
				'post_id' => $this->post_id,
			];
		}

		// Fall back to searching all other Elementor documents.
		$found = $this->find_in_all_documents( $element_id );
		if ( is_wp_error( $found ) ) {
			return $found;
		}
		return $found;
	}

	/**
	 * Re-render a single widget's HTML from its stored settings.
	 *
	 * @param string $element_id
	 * @return string|\WP_Error
	 */
	public function render_widget( $element_id ) {
		$document = $this->get();
		if ( is_wp_error( $document ) ) {
			return $document;
		}
		$elements = $document->get_elements_data();
		$node     = self::find( $elements, $element_id );
		$render_post_id = $this->post_id;

		if ( null === $node ) {
			// Search all documents for this element.
			$found = $this->find_in_all_documents( $element_id );
			if ( is_wp_error( $found ) ) {
				return $found;
			}
			$node            = $found['node'];
			$render_post_id  = $found['post_id'];
			$document        = \Elementor\Plugin::$instance->documents->get( $render_post_id );
		}

		global $post;
		$orig_post = $post;
		query_posts(
			[
				'p'         => $render_post_id,
				'post_type' => 'any',
			]
		);
		$post = get_post( $render_post_id );

		if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->documents ) ) {
			\Elementor\Plugin::$instance->documents->switch_to_document( $document );
		}

		$html = self::render_html( $node, false );

		wp_reset_query();
		$post = $orig_post;

		return $html;
	}

	/**
	 * Locate a node by id and run a mutator on it (by reference), then persist.
	 *
	 * @param string   $element_id
	 * @param callable $mutator function ( array &$node, string $type ): array|\WP_Error
	 * @return array|\WP_Error
	 */
	public function mutate_node( $element_id, callable $mutator ) {
		$document = $this->get();
		if ( is_wp_error( $document ) ) {
			return $document;
		}

		$elements = $document->get_elements_data();
		if ( ! is_array( $elements ) || empty( $elements ) ) {
			$elements = [];
		}

		$result = null;
		$found  = false;

		$walk = function ( &$nodes ) use ( &$walk, $element_id, $mutator, &$result, &$found ) {
			foreach ( $nodes as &$node ) {
				if ( isset( $node['id'] ) && (string) $node['id'] === (string) $element_id ) {
					$result = call_user_func_array( $mutator, [ &$node, self::node_type( $node ) ] );
					$found  = true;
					return true;
				}
				if ( ! empty( $node['elements'] ) && is_array( $node['elements'] ) ) {
					if ( $walk( $node['elements'] ) ) {
						return true;
					}
				}
			}
			return false;
		};
		$walk( $elements );

		if ( ! $found ) {
			// Search all other documents for this element.
			$found_doc = $this->find_in_all_documents( $element_id );
			if ( is_wp_error( $found_doc ) ) {
				return $found_doc;
			}
			$source_post_id = $found_doc['post_id'];
			$source_doc     = \Elementor\Plugin::$instance->documents->get( $source_post_id );
			$elements       = $source_doc->get_elements_data();
			$walk( $elements );
			if ( ! $found ) {
				return new \WP_Error( 'ri2_element_not_found', __( 'Element not found in document.', 'roman-inline-2' ), [ 'status' => 404 ] );
			}
			$document = $source_doc;
		}
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		try {
			$saved = $document->save( [ 'elements' => $elements ] );
		} catch ( \Throwable $e ) {
			return new \WP_Error( 'ri2_save_exception', $e->getMessage(), [ 'status' => 400 ] );
		}
		if ( is_wp_error( $saved ) ) {
			return $saved;
		}

		return is_array( $result ) ? $result : [ 'success' => true ];
	}

	/**
	 * Recursively find a node (deep copy) by id.
	 *
	 * @param array  $nodes
	 * @param string $element_id
	 * @return array|null
	 */
	public static function find( $nodes, $element_id ) {
		if ( ! is_array( $nodes ) ) {
			return null;
		}
		foreach ( $nodes as $node ) {
			if ( isset( $node['id'] ) && (string) $node['id'] === (string) $element_id ) {
				return $node;
			}
			if ( ! empty( $node['elements'] ) && is_array( $node['elements'] ) ) {
				$found = self::find( $node['elements'], $element_id );
				if ( null !== $found ) {
					return $found;
				}
			}
		}
		return null;
	}

	/**
	 * Search all Elementor documents for an element by id.
	 *
	 * Used as a fallback when the element isn't in the current post's document
	 * (e.g. it's in a Theme Builder header/footer template).
	 *
	 * @param string $element_id
	 * @return array|\WP_Error { node: array, type: string, post_id: int }
	 */
	private function find_in_all_documents( $element_id ) {
		if ( ! class_exists( '\Elementor\Plugin' ) ) {
			return new \WP_Error( 'ri2_no_elementor', __( 'Elementor is not active.', 'roman-inline-2' ), [ 'status' => 500 ] );
		}

		// Query all Elementor-built posts, excluding the current post.
		$query = new \WP_Query( [
			'post_type'      => 'any',
			'posts_per_page' => 200,
			'fields'         => 'ids',
			'no_found_rows'  => true,
			'meta_key'       => '_elementor_edit_mode',
			'meta_value'     => 'builder',
			'post__not_in'   => [ $this->post_id ],
		] );

		foreach ( $query->posts as $doc_post_id ) {
			$doc = \Elementor\Plugin::$instance->documents->get( $doc_post_id );
			if ( ! $doc ) {
				continue;
			}
			$elements = $doc->get_elements_data();
			$node     = self::find( $elements, $element_id );
			if ( null !== $node ) {
				return [
					'node'    => $node,
					'type'    => self::node_type( $node ),
					'post_id' => $doc_post_id,
				];
			}
		}

		return new \WP_Error( 'ri2_element_not_found', __( 'Element not found in document.', 'roman-inline-2' ), [ 'status' => 404 ] );
	}

	/**
	 * Resolve the element/widget type string of a node.
	 *
	 * @param array $node
	 * @return string
	 */
	public static function node_type( array $node ) {
		if ( ! empty( $node['widgetType'] ) ) {
			return (string) $node['widgetType'];
		}
		return isset( $node['elType'] ) ? (string) $node['elType'] : '';
	}

	/**
	 * Create a live Elementor element instance from node data.
	 *
	 * @param array $node
	 * @return \Elementor\Element_Base|null
	 */
	public static function create_instance( array $node ) {
		if ( ! class_exists( '\Elementor\Plugin' ) ) {
			return null;
		}
		try {
			return \Elementor\Plugin::$instance->elements_manager->create_element_instance( $node );
		} catch ( \Throwable $e ) {
			return null;
		}
	}

	/**
	 * Is this element an Atomic (V4) widget/element?
	 *
	 * @param \Elementor\Element_Base|null $instance
	 * @return bool
	 */
	public static function is_atomic( $instance ) {
		if ( ! $instance ) {
			return false;
		}
		return method_exists( $instance, 'get_atomic_settings' ) && method_exists( $instance, 'get_props_schema' );
	}

	/**
	 * Render a single element to HTML.
	 *
	 * @param array $node
	 * @param bool  $edit_mode Force Elementor edit-mode so inline markers are emitted.
	 * @return string
	 */
	public static function render_html( array $node, $edit_mode = false ) {
		$instance = self::create_instance( $node );
		if ( ! $instance ) {
			return '';
		}

		$editor = ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->editor ) )
			? \Elementor\Plugin::$instance->editor
			: null;

		$previous = null;
		if ( $edit_mode && $editor ) {
			$previous = $editor->is_edit_mode();
			$editor->set_edit_mode( true );
		}

		$html = '';
		try {
			ob_start();
			$instance->print_element();
			$html = ob_get_clean();
		} catch ( \Throwable $e ) {
			if ( ob_get_level() > 0 ) {
				ob_end_clean();
			}
			$html = '';
		}

		if ( $edit_mode && $editor ) {
			$editor->set_edit_mode( $previous );
		}

		return $html;
	}
}
