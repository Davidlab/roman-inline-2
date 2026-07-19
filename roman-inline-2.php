<?php
/**
 * Plugin Name: Roman Inline 2
 * Plugin URI:  https://example.com/roman-inline-2
 * Description: Front-end inline editing for Elementor — per-widget handler architecture. Each widget type gets a dedicated script for a smooth, tailored editing experience. Extensible via a handler registration API for 3rd-party widgets.
 * Version:     2.0.0
 * Author:      Roman
 * License:     GPL-2.0+
 * License URI: http://www.gnu.org/licenses/gpl-2.0.txt
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Text Domain: roman-inline-2
 *
 * @package RomanInline2
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ROMAN_INLINE_2_VERSION', '2.0.2' );
define( 'ROMAN_INLINE_2_FILE', __FILE__ );
define( 'ROMAN_INLINE_2_PATH', plugin_dir_path( __FILE__ ) );
define( 'ROMAN_INLINE_2_URL', plugin_dir_url( __FILE__ ) );

/**
 * Lightweight autoloader for the RomanInline2\ namespace.
 *
 * Maps RomanInline2\Some_Class       -> includes/Some_Class.php
 *      RomanInline2\Sub\Some_Class   -> includes/Sub/Some_Class.php
 */
spl_autoload_register(
	function ( $class ) {
		$prefix = 'RomanInline2\\';
		if ( strncmp( $class, $prefix, strlen( $prefix ) ) !== 0 ) {
			return;
		}
		$relative = substr( $class, strlen( $prefix ) );
		$relative = str_replace( '\\', DIRECTORY_SEPARATOR, $relative );
		$file     = ROMAN_INLINE_2_PATH . 'includes' . DIRECTORY_SEPARATOR . $relative . '.php';
		if ( is_readable( $file ) ) {
			require_once $file;
		}
	}
);

register_activation_hook( __FILE__, [ \RomanInline2\Capabilities::class, 'on_activate' ] );
register_deactivation_hook( __FILE__, [ \RomanInline2\Capabilities::class, 'on_deactivate' ] );

add_action(
	'plugins_loaded',
	function () {
		if ( ! did_action( 'elementor/loaded' ) && ! defined( 'ELEMENTOR_VERSION' ) ) {
			add_action(
				'admin_notices',
				function () {
					if ( ! current_user_can( 'activate_plugins' ) ) {
						return;
					}
					echo '<div class="notice notice-warning"><p><strong>Roman Inline 2</strong> requires Elementor to be active.</p></div>';
				}
			);
			return;
		}

		\RomanInline2\Plugin::instance();
	},
	20
);
