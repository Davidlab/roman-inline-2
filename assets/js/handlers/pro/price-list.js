/**
 * Roman Inline 2 — Pro price-list widget handler.
 *
 * Repeater control 'price_list' with sub-fields:
 *   - title          (TEXT)      → inline edit on click
 *   - item_description (TEXTAREA) → inline edit on click
 *   - price          (TEXT)      → inline edit on click
 *   - image          (MEDIA)     → toolbar "Change Image" button
 *   - link           (URL)       → toolbar "Edit Link" button
 *
 * Per-item hover toolbar with: Change Image, Edit Link, Delete.
 * Click-to-edit still works for title, description, and price text.
 *
 * Markup: .elementor-price-list-item (li), .elementor-price-list-title,
 *         .elementor-price-list-description, .elementor-price-list-price,
 *         .elementor-price-list-image img.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const SELECTOR = '.elementor-widget-price-list[data-id]';

	let toolbars = [];      // [{ bar, itemIndex, itemEl }]
	let hoveredWidget = null;
	let cachedField = null;
	let rafId = null;
	let mouseX = 0, mouseY = 0;

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

	function closeAnyPopover() {
		var lp = document.querySelector( '.ri2-linkpop' );
		if ( lp && lp.parentNode ) { lp.parentNode.removeChild( lp ); }
		var vp = document.querySelector( '.ri2-vidpop' );
		if ( vp && vp.parentNode ) { vp.parentNode.removeChild( vp ); }
	}

	/* --- Per-item action toolbar --- */
	function createToolbar( itemIndex, itemEl, field ) {
		var bar = document.createElement( 'div' );
		bar.className = 'ri2-carousel-actions ri2-ui';
		bar.dataset.itemIndex = itemIndex;

		// Change Image button
		var imgBtn = document.createElement( 'button' );
		imgBtn.type = 'button';
		imgBtn.className = 'ri2-carousel-actbtn ri2-carousel-actbtn--image';
		imgBtn.innerHTML = '<span class="dashicons dashicons-format-image"></span>';
		imgBtn.title = RI.i18n.changeImage || 'Change Image';
		imgBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault(); e.stopPropagation();
			closeAnyPopover();
			doChangeImage( itemIndex, itemEl );
		} );
		imgBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		bar.appendChild( imgBtn );

		// Edit Link button
		var linkBtn = document.createElement( 'button' );
		linkBtn.type = 'button';
		linkBtn.className = 'ri2-carousel-actbtn ri2-carousel-actbtn--link';
		linkBtn.innerHTML = '<span class="dashicons dashicons-admin-links"></span>';
		linkBtn.title = RI.i18n.link || 'Link';
		linkBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault(); e.stopPropagation();
			if ( document.querySelector( '.ri2-linkpop' ) ) {
				closeAnyPopover();
				return;
			}
			closeAnyPopover();
			doEditLink( itemIndex, itemEl );
		} );
		linkBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		bar.appendChild( linkBtn );

		// Delete Item button
		var delBtn = document.createElement( 'button' );
		delBtn.type = 'button';
		delBtn.className = 'ri2-carousel-actbtn ri2-carousel-actbtn--delete';
		delBtn.innerHTML = '<span class="dashicons dashicons-trash"></span>';
		delBtn.title = RI.i18n.deleteItem || 'Delete Item';
		delBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault(); e.stopPropagation();
			closeAnyPopover();
			doDeleteItem( itemIndex );
		} );
		delBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		bar.appendChild( delBtn );

		return bar;
	}

	function positionToolbar( bar, itemEl ) {
		var r = itemEl.getBoundingClientRect();
		var barW = bar.offsetWidth || 120;
		var barH = bar.offsetHeight || 36;
		bar.style.top = ( r.bottom - barH - 4 ) + 'px';
		bar.style.left = ( r.right - barW - 4 ) + 'px';
	}

	function clearToolbars() {
		for ( var i = 0; i < toolbars.length; i++ ) {
			if ( toolbars[ i ].bar && toolbars[ i ].bar.parentNode ) {
				toolbars[ i ].bar.parentNode.removeChild( toolbars[ i ].bar );
			}
		}
		toolbars = [];
	}

	function clearAll() {
		clearToolbars();
		stopRafLoop();
	}

	function showToolbars( widget, field ) {
		clearAll();
		cachedField = field;
		startRafLoop( widget );
	}

	/* --- rAF loop: sync toolbars to visible items --- */
	function mouseInWidget( widget ) {
		var el = document.elementFromPoint( mouseX, mouseY );
		if ( el ) {
			if ( widgetOf( el ) === widget ) { return true; }
			for ( var i = 0; i < toolbars.length; i++ ) {
				if ( toolbars[ i ].bar === el || toolbars[ i ].bar.contains( el ) ) { return true; }
			}
		}
		var r = widget.getBoundingClientRect();
		if ( mouseX >= r.left && mouseX <= r.right && mouseY >= r.top && mouseY <= r.bottom ) {
			return true;
		}
		return false;
	}

	function startRafLoop( widget ) {
		stopRafLoop();
		rafId = requestAnimationFrame( function tick() {
			try {
				if ( ! hoveredWidget || ! mouseInWidget( widget ) ) {
					clearAll();
					hoveredWidget = null;
					return;
				}
				if ( document.querySelector( '.ri2-editing' ) ) {
					clearToolbars();
				} else {
					syncToolbars( widget, cachedField );
				}
			} catch ( err ) {
				console.error( 'RI2 price-list rAF tick error:', err );
			}
			rafId = requestAnimationFrame( tick );
		} );
	}

	function stopRafLoop() {
		if ( rafId ) { cancelAnimationFrame( rafId ); rafId = null; }
	}

	function syncToolbars( widget, field ) {
		var items = getItems( widget );
		var seen = [];
		var needed = [];

		for ( var i = 0; i < items.length; i++ ) {
			var r = items[ i ].getBoundingClientRect();
			if ( r.width < 24 || r.height < 24 ) { continue; }
			if ( r.bottom < 0 || r.top > window.innerHeight ) { continue; }
			seen.push( items[ i ] );
			needed.push( { itemEl: items[ i ], itemIndex: i } );
		}

		// Remove toolbars for items no longer visible.
		for ( var k = toolbars.length - 1; k >= 0; k-- ) {
			var stillVisible = toolbars[ k ].itemEl && seen.indexOf( toolbars[ k ].itemEl ) >= 0;
			if ( ! stillVisible ) {
				if ( toolbars[ k ].bar.parentNode ) { toolbars[ k ].bar.parentNode.removeChild( toolbars[ k ].bar ); }
				toolbars.splice( k, 1 );
			}
		}

		// Add toolbars for visible items that don't have one yet.
		for ( var m = 0; m < needed.length; m++ ) {
			var has = false;
			for ( var n = 0; n < toolbars.length; n++ ) {
				if ( toolbars[ n ].itemEl === needed[ m ].itemEl ) { has = true; break; }
			}
			if ( has ) { continue; }
			var bar = createToolbar( needed[ m ].itemIndex, needed[ m ].itemEl, field );
			document.body.appendChild( bar );
			toolbars.push( { bar: bar, itemIndex: needed[ m ].itemIndex, itemEl: needed[ m ].itemEl } );
		}

		// Reposition all toolbars.
		for ( var p = 0; p < toolbars.length; p++ ) {
			positionToolbar( toolbars[ p ].bar, toolbars[ p ].itemEl );
		}
	}

	document.addEventListener( 'mousemove', function ( e ) {
		mouseX = e.clientX;
		mouseY = e.clientY;
	}, { passive: true } );

	/* --- Actions --- */
	function getCtx( cb ) {
		if ( ! hoveredWidget ) { return; }
		var widget = hoveredWidget;
		var ctx = RI.ctx( widget );
		ctx.getFields().then( function ( res ) {
			var field = findRepeaterField( res );
			if ( ! field ) { return; }
			cb( ctx, widget, field );
		} );
	}

	function findToolbarForItem( itemIndex ) {
		for ( var i = 0; i < toolbars.length; i++ ) {
			if ( toolbars[ i ].itemIndex === itemIndex ) {
				var bar = toolbars[ i ].bar;
				var r = bar.getBoundingClientRect();
				return {
					getBoundingClientRect: function () { return r; },
					querySelector: function () { return null; },
					tagName: 'DIV'
				};
			}
		}
		return null;
	}

	function doChangeImage( itemIndex, itemEl ) {
		getCtx( function ( ctx, widget, field ) {
			clearToolbars();
			ctx.openMedia( {
				onSelect: function ( attachment ) {
					ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
					ctx.saveRepeaterItem( field.key, itemIndex, 'image', attachment.id )
						.then( function () { return ctx.refreshWidget(); } )
						.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
						.catch( function ( err ) { ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' ); } );
				}
			} );
		} );
	}

	function doEditLink( itemIndex, itemEl ) {
		var toolbarEl = findToolbarForItem( itemIndex );
		getCtx( function ( ctx, widget, field ) {
			clearToolbars();
			var repItem = ( field.items || [] )[ itemIndex ];
			var currentUrl = ( repItem && repItem.link && repItem.link.url ) || '';
			var currentBlank = !!( repItem && repItem.link && repItem.link.is_external );
			var itemAnchor = itemEl.querySelector( 'a' ) || itemEl;
			ctx.editLink( toolbarEl || itemAnchor, {
				key: field.key, itemIndex: itemIndex, subField: 'link'
			} );
		} );
	}

	function doDeleteItem( itemIndex ) {
		getCtx( function ( ctx, widget, field ) {
			clearToolbars();
			ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
			ctx.deleteRepeaterItem( field.key, itemIndex )
				.then( function () { return ctx.refreshWidget(); } )
				.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
				.catch( function ( err ) { ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' ); } );
		} );
	}

	/* --- Handler --- */
	const handler = {
		onClick: function ( event, widget, ctx ) {
			const anchor = event.target.closest && event.target.closest( 'a' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			const item = findItemIndex( widget, event.target );
			if ( ! item ) { return; }

			ctx.getFields().then( function ( res ) {
				const field = findRepeaterField( res );
				if ( ! field ) { return; }

				// Image click → replace image
				const img = item.el.querySelector( '.elementor-price-list-image img' );
				if ( img && ( event.target === img || img.contains( event.target ) ) ) {
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
			} ).catch( function () {} );
		},
		onHover: function ( event, widget, ctx ) {
			if ( hoveredWidget === widget ) { return; }
			hoveredWidget = widget;
			ctx.getFields().then( function ( res ) {
				var field = findRepeaterField( res );
				if ( ! field ) { return; }
				if ( hoveredWidget === widget ) {
					showToolbars( widget, field );
				}
			} );
		},
		onLeave: function () {}
	};

	RI.register( 'price-list', handler );

} )( window.RomanInline2 );
