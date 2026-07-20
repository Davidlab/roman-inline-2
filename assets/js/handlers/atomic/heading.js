/**
 * Roman Inline 2 — Atomic e-heading widget handler.
 *
 * Click the heading element to inline-edit its text with rich-text toolbar.
 * Classic heading widget will have its own handler file when implemented.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	var handler = {
		onClick: function ( event, widget, ctx ) {
			var heading = widget.querySelector( 'h1, h2, h3, h4, h5, h6' ) || widget;

			ctx.getFields().then( function ( res ) {
				var textField = ( res.fields || [] ).filter( function ( f ) {
					return 'rich_text' === f.kind || 'text' === f.kind;
				} )[ 0 ];

				if ( ! textField ) {
					ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
					return;
				}

				ctx.editText( heading, {
					key:      textField.key,
					kind:     'rich_text',
					isAtomic: true
				} );
			} ).catch( function () {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} );
		}
	};

	RI.register( 'e-heading', handler );

} )( window.RomanInline2 );
