/**
 * Roman Inline 2 — Pro price-table widget handler.
 *
 * - Click heading → inline edit (text).
 * - Click sub_heading → inline edit (text).
 * - Click period → inline edit (text).
 * - Click button text → inline edit (text).
 * - Click footer_additional_info → inline edit (text).
 * - Click ribbon text → inline edit (text).
 * - Click feature item text → inline edit (repeater sub-field).
 * - Hover the widget → floating link button (top-right) to edit the link.
 *
 * Controls: heading, sub_heading, price, period, button_text, footer_additional_info,
 *           ribbon_title, features_list (repeater: item_text), link.
 * Markup: .elementor-price-table__heading, .elementor-price-table__subheading,
 *         .elementor-price-table__period, .elementor-price-table__button,
 *         .elementor-price-table__additional_info, .elementor-ribbon-inner,
 *         .elementor-price-table__features-list li .elementor-price-table__feature-inner span.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const SELECTOR = '.elementor-widget-price-table[data-id]';

	/* --- Floating link button --- */
	let linkBtn = null;
	let linkLeaveTimer = null;

	function ensureLinkBtn() {
		if ( linkBtn ) { return; }
		linkBtn = document.createElement( 'button' );
		linkBtn.type = 'button';
		linkBtn.className = 'ri2-linkbtn ri2-ui';
		linkBtn.innerHTML = '<span class="dashicons dashicons-admin-links"></span>';
		linkBtn.title = RI.i18n.editLink || 'Edit Link';
		linkBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( linkLeaveTimer );
			hideLinkBtn();
			const w = linkBtn._widget;
			if ( w ) {
				RI.ctx( w ).editLink( w, { key: 'link' } );
			}
		} );
		linkBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( linkBtn );
	}

	function showLinkBtn( widget ) {
		ensureLinkBtn();
		clearTimeout( linkLeaveTimer );
		linkBtn._widget = widget;
		const r = widget.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideLinkBtn(); return; }
		linkBtn.classList.add( 'is-visible' );
		linkBtn.style.top = ( r.top + 6 ) + 'px';
		linkBtn.style.left = ( r.right - linkBtn.offsetWidth - 6 ) + 'px';
	}

	function hideLinkBtn() {
		if ( linkBtn ) { linkBtn.classList.remove( 'is-visible' ); }
	}

	function widgetOf( el ) {
		return el.closest && el.closest( SELECTOR );
	}

	function findField( res, kind ) {
		return ( res.fields || [] ).filter( function ( f ) { return kind === f.kind; } )[ 0 ];
	}

	function findFieldByKey( res, key ) {
		return ( res.fields || [] ).filter( function ( f ) { return f.key === key; } )[ 0 ];
	}

	function findRepeaterField( res ) {
		return ( res.fields || [] ).filter( function ( f ) { return 'repeater' === f.kind; } )[ 0 ];
	}

	/* --- Widget hover for link button --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( ! RI.isActive() ) { return; }
			if ( findField( res, 'link' ) ) {
				showLinkBtn( widget );
			}
		} ).catch( function () {} );
	}, true );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		clearTimeout( linkLeaveTimer );
		linkLeaveTimer = setTimeout( function () {
			if ( linkBtn && linkBtn.matches( ':hover' ) ) { return; }
			hideLinkBtn();
		}, 100 );
	}, true );

	window.addEventListener( 'scroll', function () { hideLinkBtn(); }, true );
	window.addEventListener( 'resize', function () { hideLinkBtn(); } );

	/* --- Handler --- */
	const handler = {
		onClick: function ( event, widget, ctx ) {
			const anchor = event.target.closest && event.target.closest( 'a' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			ctx.getFields().then( function ( res ) {
				// Heading
				const headingEl = widget.querySelector( '.elementor-price-table__heading' );
				if ( headingEl && ( event.target === headingEl || headingEl.contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'heading' );
					if ( field ) {
						ctx.editText( headingEl, { key: field.key, kind: 'text', isAtomic: false } );
						return;
					}
				}

				// Sub-heading
				const subEl = widget.querySelector( '.elementor-price-table__subheading' );
				if ( subEl && ( event.target === subEl || subEl.contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'sub_heading' );
					if ( field ) {
						ctx.editText( subEl, { key: field.key, kind: 'text', isAtomic: false } );
						return;
					}
				}

				// Period
				const periodEl = widget.querySelector( '.elementor-price-table__period' );
				if ( periodEl && ( event.target === periodEl || periodEl.contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'period' );
					if ( field ) {
						ctx.editText( periodEl, { key: field.key, kind: 'text', isAtomic: false } );
						return;
					}
				}

				// Button text
				const btnEl = widget.querySelector( '.elementor-price-table__button' );
				if ( btnEl && ( event.target === btnEl || btnEl.contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'button_text' );
					if ( field ) {
						ctx.editText( btnEl, { key: field.key, kind: 'text', isAtomic: false } );
						return;
					}
				}

				// Additional info
				const infoEl = widget.querySelector( '.elementor-price-table__additional_info' );
				if ( infoEl && ( event.target === infoEl || infoEl.contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'footer_additional_info' );
					if ( field ) {
						ctx.editText( infoEl, { key: field.key, kind: 'text', isAtomic: false } );
						return;
					}
				}

				// Ribbon
				const ribbonEl = widget.querySelector( '.elementor-ribbon-inner' );
				if ( ribbonEl && ( event.target === ribbonEl || ribbonEl.contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'ribbon_title' );
					if ( field ) {
						ctx.editText( ribbonEl, { key: field.key, kind: 'text', isAtomic: false } );
						return;
					}
				}

				// Features list (repeater)
				const featureItems = widget.querySelectorAll( '.elementor-price-table__features-list > li' );
				for ( let i = 0; i < featureItems.length; i++ ) {
					if ( featureItems[ i ] === event.target || featureItems[ i ].contains( event.target ) ) {
						const span = featureItems[ i ].querySelector( '.elementor-price-table__feature-inner span' );
						if ( span && ( event.target === span || span.contains( event.target ) ) ) {
							const repField = findRepeaterField( res );
							if ( repField ) {
								ctx.editText( span, {
									key: repField.key, kind: 'text', itemIndex: i, subField: 'item_text'
								} );
								return;
							}
						}
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

	RI.register( 'price-table', handler );

} )( window.RomanInline2 );
