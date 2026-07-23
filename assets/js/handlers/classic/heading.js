/**
 * Roman Inline 2 — Classic heading widget handler.
 *
 * Click the heading element to inline-edit its text.
 * Uses marker-based field detection (data-elementor-setting-key).
 * Falls back to introspection (popover) if no markers found.
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

				if ( 1 === texts.length ) {
					const field = texts[ 0 ];
					let node = ctx.locateNode( widget, field, event.target );
					node = ctx.preferTextNode( node );

					ctx.editText( node, {
						key:      field.key,
						kind:     field.kind,
						isAtomic: false
					} );
				} else {
					// Multiple text fields — try to match the clicked node.
					let picked = null;
					for ( let i = 0; i < texts.length; i++ ) {
						if ( texts[ i ].match ) {
							const n = ctx.locateNode( widget, texts[ i ], event.target );
							if ( n && n.contains( event.target ) ) {
								picked = { field: texts[ i ], node: n };
								break;
							}
						}
					}

					if ( picked ) {
						ctx.editText( ctx.preferTextNode( picked.node ), {
							key:      picked.field.key,
							kind:     picked.field.kind,
							isAtomic: false
						} );
					} else {
						// Fallback: edit the first text field.
						const f = texts[ 0 ];
						const n2 = ctx.locateNode( widget, f, event.target );
						ctx.editText( ctx.preferTextNode( n2 ), {
							key:      f.key,
							kind:     f.kind,
							isAtomic: false
						} );
					}
				}
			} ).catch( function () {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} );
		}
	};

	RI.register( 'heading', handler );

} )( window.RomanInline2 );
