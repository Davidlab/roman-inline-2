/**
 * Roman Inline 2 — Pro animated-headline widget handler.
 *
 * - Click before_text → inline edit (text).
 * - Click highlighted_text → inline edit (text).
 * - Click after_text → inline edit (text).
 * - Hover the widget → floating link button (top-right) to edit the link.
 *
 * Controls: before_text, highlighted_text, rotating_text, after_text, link.
 * Markup: .elementor-headline-plain-text, .elementor-headline-dynamic-text.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const SELECTOR = '.elementor-widget-animated-headline[data-id]';

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
				const plainTexts = widget.querySelectorAll( '.elementor-headline-plain-text' );
				const dynamicTexts = widget.querySelectorAll( '.elementor-headline-dynamic-text' );

				// before_text = first .elementor-headline-plain-text
				if ( plainTexts.length > 0 && ( event.target === plainTexts[0] || plainTexts[0].contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'before_text' );
					if ( field ) {
						ctx.editText( plainTexts[0], { key: field.key, kind: 'text', isAtomic: false } );
						return;
					}
				}

				// after_text = second .elementor-headline-plain-text
				if ( plainTexts.length > 1 && ( event.target === plainTexts[1] || plainTexts[1].contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'after_text' );
					if ( field ) {
						ctx.editText( plainTexts[1], { key: field.key, kind: 'text', isAtomic: false } );
						return;
					}
				}

				// highlighted_text or rotating_text = .elementor-headline-dynamic-text
				for ( let i = 0; i < dynamicTexts.length; i++ ) {
					if ( event.target === dynamicTexts[i] || dynamicTexts[i].contains( event.target ) ) {
						// Try highlighted_text first, then rotating_text
						let field = findFieldByKey( res, 'highlighted_text' );
						if ( ! field ) {
							field = findFieldByKey( res, 'rotating_text' );
						}
						if ( field ) {
							ctx.editText( dynamicTexts[i], { key: field.key, kind: 'text', isAtomic: false } );
							return;
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

	RI.register( 'animated-headline', handler );

} )( window.RomanInline2 );
