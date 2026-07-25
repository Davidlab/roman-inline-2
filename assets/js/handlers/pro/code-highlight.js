/**
 * Roman Inline 2 — Pro code-highlight widget handler.
 *
 * - Click the code block → inline edit (text, no toolbar).
 *
 * Controls: code, language.
 * Markup: pre > code with .language-{{language}} class, content inside <xmp>.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const SELECTOR = '.elementor-widget-code-highlight[data-id]';

	function widgetOf( el ) {
		return el.closest && el.closest( SELECTOR );
	}

	function findField( res, kind ) {
		return ( res.fields || [] ).filter( function ( f ) { return kind === f.kind; } )[ 0 ];
	}

	function findFieldByKey( res, key ) {
		return ( res.fields || [] ).filter( function ( f ) { return f.key === key; } )[ 0 ];
	}

	/* --- Handler --- */
	const handler = {
		onClick: function ( event, widget, ctx ) {
			ctx.getFields().then( function ( res ) {
				// Code block
				const codeEl = widget.querySelector( 'pre code' );
				if ( codeEl && ( event.target === codeEl || codeEl.contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'code' ) || findField( res, 'text' );
					if ( field ) {
						ctx.editText( codeEl, { key: field.key, kind: 'text', isAtomic: false } );
						return;
					}
				}

				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} ).catch( function () {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'code-highlight', handler );

} )( window.RomanInline2 );
