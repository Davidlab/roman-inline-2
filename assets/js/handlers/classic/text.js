/**
 * Roman Inline 2 — Classic text-editor widget handler.
 *
 * Click the text area to inline-edit with rich-text toolbar.
 * Uses marker-based field detection (data-elementor-setting-key).
 * Falls back to introspection if no markers found.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const handler = {
		onClick: function ( event, widget, ctx ) {
			ctx.getFields().then( function ( res ) {
				const texts = ( res.fields || [] ).filter( function ( f ) {
					return 'text' === f.kind || 'rich_text' === f.kind;
				} );

				if ( ! texts.length ) {
					ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
					return;
				}

				// Text editor widget typically has a single 'editor' field.
				const field = texts[ 0 ];
				let node = ctx.locateNode( widget, field, event.target );
				node = ctx.preferTextNode( node );

				ctx.editText( node, {
					key:      field.key,
					kind:     field.kind,
					isAtomic: false
				} );
			} ).catch( function () {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} );
		}
	};

	RI.register( 'text-editor', handler );

} )( window.RomanInline2 );
