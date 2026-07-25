/**
 * Roman Inline 2 — Pro call-to-action widget handler.
 *
 * - Click title → inline edit (rich text).
 * - Click description → inline edit (rich text).
 * - Click button text → inline edit (text).
 * - Click ribbon text → inline edit (text).
 * - Hover the bg image → floating "Change Image" button.
 * - Hover the widget → floating link button (top-right) to edit the link.
 *
 * Controls: title, description, button, link, bg_image, graphic_image, ribbon_title.
 * Markup: .elementor-cta__title, .elementor-cta__description, .elementor-cta__button,
 *         .elementor-cta__bg, .elementor-ribbon-inner.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const SELECTOR = '.elementor-widget-call-to-action[data-id]';

	/* --- Floating "Change Image" button --- */
	let imgBtn = null;
	let hoveredBg = null;
	let imgLeaveTimer = null;

	function ensureImgBtn() {
		if ( imgBtn ) { return; }
		imgBtn = document.createElement( 'button' );
		imgBtn.type = 'button';
		imgBtn.className = 'ri2-imgbtn ri2-ui';
		imgBtn.innerHTML = '<span class="dashicons dashicons-format-image"></span> ' + ( RI.i18n.changeImage || 'Change Image' );
		imgBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( imgLeaveTimer );
			if ( hoveredBg ) {
				const bg = hoveredBg;
				hideImgBtn();
				const widget = widgetOf( bg );
				if ( widget ) {
					doReplaceImage( bg, RI.ctx( widget ), 'bg_image' );
				}
			}
		} );
		imgBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( imgBtn );
	}

	function showImgBtn( bgEl ) {
		ensureImgBtn();
		clearTimeout( imgLeaveTimer );
		hoveredBg = bgEl;
		const r = bgEl.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideImgBtn(); return; }
		imgBtn.style.top = ( r.top + 8 ) + 'px';
		imgBtn.style.left = ( r.left + 8 ) + 'px';
		imgBtn.classList.add( 'is-visible' );
	}

	function hideImgBtn() {
		if ( imgBtn ) { imgBtn.classList.remove( 'is-visible' ); }
		hoveredBg = null;
	}

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

	/* --- Helpers --- */
	function widgetOf( el ) {
		return el.closest && el.closest( SELECTOR );
	}

	function findField( res, kind ) {
		return ( res.fields || [] ).filter( function ( f ) { return kind === f.kind; } )[ 0 ];
	}

	function findFieldByKey( res, key ) {
		return ( res.fields || [] ).filter( function ( f ) { return f.key === key; } )[ 0 ];
	}

	function doReplaceImage( node, ctx, key ) {
		ctx.getFields().then( function ( res ) {
			const field = findFieldByKey( res, key ) || findField( res, 'image' );
			if ( ! field ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}
			ctx.replaceImage( node, {
				key:      field.key,
				isAtomic: false
			} );
		} );
	}

	/* --- BG image hover (direct mouseover/mouseout) --- */
	// Use the bg-wrapper so the overlay div doesn't block mouse events.
	// Also match any image field (bg_image or generic 'image') so the
	// floating button appears even for placeholder images.
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		const bgWrap = widget.querySelector( '.elementor-cta__bg-wrapper' );
		if ( bgWrap && ( e.target === bgWrap || bgWrap.contains( e.target ) ) ) {
			RI.ctx( widget ).getFields().then( function ( res ) {
				if ( ! RI.isActive() ) { return; }
				if ( findFieldByKey( res, 'bg_image' ) || findField( res, 'image' ) ) {
					showImgBtn( bgWrap );
				}
			} ).catch( function () {} );
		}
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! hoveredBg ) { return; }
		if ( e.relatedTarget && imgBtn && ( e.relatedTarget === imgBtn || imgBtn.contains( e.relatedTarget ) ) ) { return; }
		clearTimeout( imgLeaveTimer );
		imgLeaveTimer = setTimeout( function () {
			if ( imgBtn && imgBtn.matches( ':hover' ) ) { return; }
			hideImgBtn();
		}, 60 );
	} );

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

	window.addEventListener( 'scroll', function () { hideImgBtn(); hideLinkBtn(); }, true );
	window.addEventListener( 'resize', function () { hideImgBtn(); hideLinkBtn(); } );

	/* --- Handler --- */
	const handler = {
		onClick: function ( event, widget, ctx ) {
			const anchor = event.target.closest && event.target.closest( 'a' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			ctx.getFields().then( function ( res ) {
				// Title
				const titleEl = widget.querySelector( '.elementor-cta__title' );
				if ( titleEl && ( event.target === titleEl || titleEl.contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'title' );
					if ( field ) {
						ctx.editText( titleEl, { key: field.key, kind: field.kind || 'rich_text', isAtomic: false } );
						return;
					}
				}

				// Description
				const descEl = widget.querySelector( '.elementor-cta__description' );
				if ( descEl && ( event.target === descEl || descEl.contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'description' );
					if ( field ) {
						ctx.editText( descEl, { key: field.key, kind: field.kind || 'rich_text', isAtomic: false } );
						return;
					}
				}

				// Button text
				const btnEl = widget.querySelector( '.elementor-cta__button' );
				if ( btnEl && ( event.target === btnEl || btnEl.contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'button' );
					if ( field ) {
						ctx.editText( btnEl, { key: field.key, kind: 'rich_text', isAtomic: false } );
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

				// BG image click → replace image
				const bgWrap = widget.querySelector( '.elementor-cta__bg-wrapper' );
				if ( bgWrap && ( event.target === bgWrap || bgWrap.contains( event.target ) ) ) {
					hideImgBtn();
					doReplaceImage( bgWrap, ctx, 'bg_image' );
					return;
				}

				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} ).catch( function () {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'call-to-action', handler );

} )( window.RomanInline2 );
