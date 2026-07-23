/**
 * Roman Inline 2 — Classic alert widget handler.
 *
 * - Click the title → inline edit (text, no toolbar).
 * - Click the description → inline edit (text, no toolbar).
 *
 * Field detection uses markers (data-elementor-setting-key) and
 * introspection (text/textarea controls).
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const handler = {
		onClick: function ( event, widget, ctx ) {
			ctx.getFields().then( function ( res ) {
				const fields = res.fields || [];

				// Title click → inline edit.
				const titleEl = widget.querySelector( '.elementor-alert-title' );
				if ( titleEl && ( event.target === titleEl || titleEl.contains( event.target ) ) ) {
					const titleField = fields.filter( function ( f ) { return 'alert_title' === f.key; } )[ 0 ];
					if ( titleField ) {
						ctx.editText( titleEl, {
							key:      titleField.key,
							kind:     titleField.kind || 'text',
							isAtomic: false
						} );
						return;
					}
				}

				// Description click → inline edit.
				const descEl = widget.querySelector( '.elementor-alert-description' );
				if ( descEl && ( event.target === descEl || descEl.contains( event.target ) ) ) {
					const descField = fields.filter( function ( f ) { return 'alert_description' === f.key; } )[ 0 ];
					if ( descField ) {
						ctx.editText( descEl, {
							key:      descField.key,
							kind:     descField.kind || 'text',
							isAtomic: false
						} );
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

	RI.register( 'alert', handler );

} )( window.RomanInline2 );
