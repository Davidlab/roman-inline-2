=== Roman Inline 2 ===
Contributors: roman
Tags: elementor, inline editing, front-end editor
Requires at least: 6.0
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 2.0.0
License: GPLv2 or later

== Description ==

Front-end inline editing for Elementor with a per-widget handler architecture.

Each widget type (heading, paragraph, image, etc.) gets a dedicated JavaScript
handler that knows exactly how that widget works — providing a smooth, tailored
editing experience instead of a one-size-fits-all generic resolver.

Third-party widgets can be added by registering custom handlers via the
`RomanInline2.register(type, handler)` JavaScript API.

== Installation ==

1. Upload `roman-inline-2` to `/wp-content/plugins/`
2. Activate the plugin through the Plugins menu in WordPress
3. Ensure Elementor is active
4. Visit any Elementor page on the front end while logged in with the
   `roman_inline_2_edit` capability
5. Click the "Roman Inline 2" toggle in the admin bar to start editing

== Changelog ==

= 2.0.0 =
* Initial release with per-widget handler architecture
* Dedicated handlers for atomic heading, paragraph, and image widgets
* Handler registration API for 3rd-party widget support
