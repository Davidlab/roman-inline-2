<?php
/**
 * Capability + role management.
 *
 * @package RomanInline2
 */

namespace RomanInline2;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Capabilities {

	const CAP  = 'roman_inline_2_edit';
	const ROLE = 'roman_inline_2_client';

	private static function privileged_roles() {
		return [ 'administrator', 'editor' ];
	}

	private static function client_role_caps() {
		return [
			'read'                 => true,
			self::CAP              => true,
			'upload_files'         => true,
			'edit_posts'           => true,
			'edit_others_posts'    => true,
			'edit_published_posts' => true,
			'edit_pages'           => true,
			'edit_others_pages'    => true,
			'edit_published_pages' => true,
		];
	}

	public static function on_activate() {
		foreach ( self::privileged_roles() as $role_name ) {
			$role = get_role( $role_name );
			if ( $role && ! $role->has_cap( self::CAP ) ) {
				$role->add_cap( self::CAP );
			}
		}

		remove_role( self::ROLE );
		add_role( self::ROLE, __( 'Roman Inline 2 Client', 'roman-inline-2' ), self::client_role_caps() );
	}

	public static function on_deactivate() {
		foreach ( self::privileged_roles() as $role_name ) {
			$role = get_role( $role_name );
			if ( $role && $role->has_cap( self::CAP ) ) {
				$role->remove_cap( self::CAP );
			}
		}
	}
}
