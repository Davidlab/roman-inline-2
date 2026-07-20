/**
 * Roman Inline 2 — Atomic e-paragraph widget handler.
 *
 * Click the paragraph element to inline-edit its text with rich-text toolbar.
 * Classic text-editor widget will have its own handler file when implemented.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	var handler = {
		onClick: function ( event, widget, ctx ) {
			var para = widget.querySelector( 'p' ) || widget;

			ctx.getFields().then( function ( res ) {
				var textField = ( res.fields || [] ).filter( function ( f ) {
					return 'rich_text' === f.kind || 'text' === f.kind;
				} )[ 0 ];

				if ( ! textField ) {
					ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
					return;
				}

				ctx.editText( para, {
					key:      textField.key,
					kind:     'rich_text',
					isAtomic: true
				} );
			} ).catch( function () {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} );
		}
	};

	RI.register( 'e-paragraph', handler );

} )( window.RomanInline2 );
