/**
 * Roman Inline 2 — Classic button widget handler.
 *
 * Click the button text to inline-edit with rich-text toolbar.
 * The toolbar includes a link icon that opens the link popover
 * to edit the button URL (same UX as atomic button).
 * Uses introspection-based field detection.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const handler = {
		onClick: function ( event, widget, ctx ) {
			// Prevent the button link from navigating while editing.
			const anchor = event.target.closest && event.target.closest( 'a.elementor-button' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			ctx.getFields().then( function ( res ) {
				const texts = ( res.fields || [] ).filter( function ( f ) {
					return 'text' === f.kind || 'rich_text' === f.kind;
				} );

				if ( ! texts.length ) {
					ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
					return;
				}

				const field = texts[ 0 ];

				// Try to find the .elementor-button-text element.
				let node = widget.querySelector( '.elementor-button-text' );
				if ( ! node ) {
					node = widget.querySelector( '.elementor-button' ) || widget;
				}

				ctx.editText( node, {
					key:      field.key,
					kind:     'rich_text',
					isAtomic: false
				} );
			} ).catch( function () {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'button', handler );

} )( window.RomanInline2 );
