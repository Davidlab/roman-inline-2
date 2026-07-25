/**
 * Roman Inline 2 — Pro price-list widget handler.
 *
 * Repeater control 'price_list' with sub-fields:
 *   - title          (TEXT)      → inline edit on click
 *   - item_description (TEXTAREA) → inline edit on click
 *   - price          (TEXT)      → inline edit on click
 *   - image          (MEDIA)     → "Change Image" button on hover
 *   - link           (URL)       → link popover on click
 *
 * Markup: .elementor-price-list-item (li), .elementor-price-list-title,
 *         .elementor-price-list-description, .elementor-price-list-price,
 *         .elementor-price-list-image img.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const SELECTOR = '.elementor-widget-price-list[data-id]';

	let imgBtn = null;
	let hoveredImg = null;
	let imgLeaveTimer = null;

	function widgetOf( el ) {
		return el.closest && el.closest( SELECTOR );
	}

	function findRepeaterField( res ) {
		return ( res.fields || [] ).filter( function ( f ) { return 'repeater' === f.kind; } )[ 0 ];
	}

	function getItems( widget ) {
		return widget.querySelectorAll( '.elementor-price-list > li' );
	}

	function findItemIndex( widget, target ) {
		const items = getItems( widget );
		for ( let i = 0; i < items.length; i++ ) {
			if ( items[ i ] === target || items[ i ].contains( target ) ) {
				return { el: items[ i ], index: i };
			}
		}
		return null;
	}

	/* --- "Change Image" button --- */
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
			if ( ! hoveredImg ) { return; }
			const img = hoveredImg;
			hideImgBtn();
			const widget = widgetOf( img );
			if ( ! widget ) { return; }
			const item = findItemIndex( widget, img );
			if ( ! item ) { return; }
			const ctx = RI.ctx( widget );
			ctx.getFields().then( function ( res ) {
				const field = findRepeaterField( res );
				if ( ! field ) { return; }
				ctx.openMedia( {
					onSelect: function ( attachment ) {
						ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
						ctx.saveRepeaterItem( field.key, item.index, 'image', attachment.id )
							.then( function () { return ctx.refreshWidget(); } )
							.then( function () {
								ctx.toast( ctx.i18n.saved || 'Saved', 'ok' );
							} )
							.catch( function ( err ) {
								ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' );
							} );
					}
				} );
			} );
		} );
		imgBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( imgBtn );
	}

	function showImgBtn( img ) {
		ensureImgBtn();
		clearTimeout( imgLeaveTimer );
		hoveredImg = img;
		const r = img.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideImgBtn(); return; }
		imgBtn.style.top = ( r.top + 8 ) + 'px';
		imgBtn.style.left = ( r.left + 8 ) + 'px';
		imgBtn.classList.add( 'is-visible' );
	}

	function hideImgBtn() {
		if ( imgBtn ) { imgBtn.classList.remove( 'is-visible' ); }
		hoveredImg = null;
	}

	/* --- Image hover --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( 'IMG' !== e.target.tagName ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		const imgWrap = e.target.closest( '.elementor-price-list-image' );
		if ( ! imgWrap ) { return; }
		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( ! RI.isActive() ) { return; }
			if ( findRepeaterField( res ) ) {
				showImgBtn( e.target );
			}
		} ).catch( function () {} );
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! hoveredImg ) { return; }
		if ( e.relatedTarget && imgBtn && ( e.relatedTarget === imgBtn || imgBtn.contains( e.relatedTarget ) ) ) { return; }
		clearTimeout( imgLeaveTimer );
		imgLeaveTimer = setTimeout( function () {
			if ( imgBtn && imgBtn.matches( ':hover' ) ) { return; }
			hideImgBtn();
		}, 60 );
	} );

	window.addEventListener( 'scroll', function () { hideImgBtn(); }, true );
	window.addEventListener( 'resize', function () { hideImgBtn(); } );

	/* --- Handler --- */
	const handler = {
		onClick: function ( event, widget, ctx ) {
			const anchor = event.target.closest && event.target.closest( 'a' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			const item = findItemIndex( widget, event.target );
			if ( ! item ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}

			ctx.getFields().then( function ( res ) {
				const field = findRepeaterField( res );
				if ( ! field ) {
					ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
					return;
				}

				// Image click → replace image
				const img = item.el.querySelector( '.elementor-price-list-image img' );
				if ( img && ( event.target === img || img.contains( event.target ) ) ) {
					hideImgBtn();
					ctx.openMedia( {
						onSelect: function ( attachment ) {
							ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
							ctx.saveRepeaterItem( field.key, item.index, 'image', attachment.id )
								.then( function () { return ctx.refreshWidget(); } )
								.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
								.catch( function ( err ) { ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' ); } );
						}
					} );
					return;
				}

				// Title
				const titleEl = item.el.querySelector( '.elementor-price-list-title' );
				if ( titleEl && ( event.target === titleEl || titleEl.contains( event.target ) ) ) {
					ctx.editText( titleEl, {
						key: field.key, kind: 'text', itemIndex: item.index, subField: 'title'
					} );
					return;
				}

				// Description
				const descEl = item.el.querySelector( '.elementor-price-list-description' );
				if ( descEl && ( event.target === descEl || descEl.contains( event.target ) ) ) {
					ctx.editText( descEl, {
						key: field.key, kind: 'text', itemIndex: item.index, subField: 'item_description'
					} );
					return;
				}

				// Price
				const priceEl = item.el.querySelector( '.elementor-price-list-price' );
				if ( priceEl && ( event.target === priceEl || priceEl.contains( event.target ) ) ) {
					ctx.editText( priceEl, {
						key: field.key, kind: 'text', itemIndex: item.index, subField: 'price'
					} );
					return;
				}

				// Link (li > a)
				const itemAnchor = item.el.querySelector( 'a.elementor-price-list-item' );
				if ( itemAnchor && ( event.target === itemAnchor || itemAnchor.contains( event.target ) ) ) {
					if ( titleEl && ( event.target === titleEl || titleEl.contains( event.target ) ) ) { return; }
					if ( descEl && ( event.target === descEl || descEl.contains( event.target ) ) ) { return; }
					if ( priceEl && ( event.target === priceEl || priceEl.contains( event.target ) ) ) { return; }
					ctx.editLink( itemAnchor, {
						key: field.key, itemIndex: item.index, subField: 'link'
					} );
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

	RI.register( 'price-list', handler );

} )( window.RomanInline2 );
