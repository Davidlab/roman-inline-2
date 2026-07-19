<?php
/**
 * Uninstall handler — removes the dedicated client role.
 *
 * @package RomanInline2
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

remove_role( 'roman_inline_2_client' );
