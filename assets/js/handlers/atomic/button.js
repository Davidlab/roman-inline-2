/**
 * Roman Inline 2 — Atomic e-button widget handler.
 *
 * Click the button text to inline-edit with rich-text toolbar.
 * The toolbar includes a link icon that opens the link popover
 * to edit the button URL.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const handler = {
		onClick: function ( event, widget, ctx ) {
			ctx.getFields().then( function ( res ) {
				const textField = ( res.fields || [] ).filter( function ( f ) {
					return 'rich_text' === f.kind || 'text' === f.kind;
				} )[ 0 ];

				if ( ! textField ) {
					ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
					return;
				}

				const node = widget.querySelector( 'a, button' ) || widget;

				ctx.editText( node, {
					key:      textField.key,
					kind:     'rich_text',
					isAtomic: true
				} );
			} ).catch( function () {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'e-button', handler );

} )( window.RomanInline2 );
