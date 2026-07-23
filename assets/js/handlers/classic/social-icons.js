/**
 * Roman Inline 2 — Classic social-icons widget handler.
 *
 * The Social Icons widget renders a grid of <a class="elementor-social-icon">
 * elements inside .elementor-social-icons-wrapper, each with an icon and link.
 *
 * Interactions:
 *   - Hover a social icon → centered edit pencil overlay appears on the icon
 *   - Click the edit pencil or the social icon → action menu with
 *     "Change Icon" and "Edit Link"
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const SELECTOR = '.elementor-widget-social-icons[data-id]';

	/* --- Edit pencil overlay --- */
	let editOverlay = null;
	let editLeaveTimer = null;
	let hoveredItem = null;
	let hoveredWidget = null;

	/* --- Add-icon button --- */
	let addBtn = null;
	let addBtnWidget = null;
	let addBtnTimer = null;

	function ensureEditOverlay() {
		if ( editOverlay ) { return; }
		editOverlay = document.createElement( 'div' );
		editOverlay.className = 'ri2-edit-overlay ri2-ui';
		editOverlay.innerHTML = '<span class="dashicons dashicons-edit"></span>';
		editOverlay.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( editLeaveTimer );
			if ( hoveredItem && hoveredWidget ) {
				const idx = itemIndexOf( hoveredWidget, hoveredItem );
				if ( idx >= 0 ) {
					showActionMenu( hoveredWidget, hoveredItem, idx );
				}
			}
		} );
		editOverlay.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( editOverlay );
	}

	function showEditOverlay( widget, item ) {
		ensureEditOverlay();
		clearTimeout( editLeaveTimer );
		hoveredItem = item;
		hoveredWidget = widget;
		const r = item.getBoundingClientRect();
		editOverlay.classList.add( 'is-visible' );
		const size = Math.min( r.width, r.height, 28 );
		editOverlay.style.width = size + 'px';
		editOverlay.style.height = size + 'px';
		editOverlay.style.top = ( r.top + ( r.height - size ) / 2 ) + 'px';
		editOverlay.style.left = ( r.left + ( r.width - size ) / 2 ) + 'px';
	}

	function hideEditOverlay() {
		if ( editOverlay ) { editOverlay.classList.remove( 'is-visible' ); }
	}

	/* --- Add-icon button functions --- */
	function ensureAddBtn() {
		if ( addBtn ) { return; }
		addBtn = document.createElement( 'button' );
		addBtn.type = 'button';
		addBtn.className = 'ri2-add-btn ri2-ui';
		addBtn.innerHTML = '<span class="dashicons dashicons-plus"></span>';
		addBtn.title = RI.i18n.addIcon || 'Add Icon';
		addBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			if ( ! addBtnWidget ) { return; }
			const w = addBtnWidget;
			const key = findSocialKey( w );
			const ctx = RI.ctx( w );
			ctx.toast( RI.i18n.saving || 'Saving…', 'saving' );
			ctx.addRepeaterItem( key, 'social-icons' )
				.then( function () {
					return ctx.refreshWidget();
				} )
				.then( function () {
					ctx.toast( RI.i18n.saved || 'Saved', 'ok' );
				} )
				.catch( function ( err ) {
					ctx.toast( ( err && err.message ) || ( RI.i18n.saveFailed || 'Save failed' ), 'error' );
				} );
		} );
		addBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( addBtn );
	}

	function showAddBtn( widget ) {
		ensureAddBtn();
		clearTimeout( addBtnTimer );
		addBtnWidget = widget;
		const items = getItems( widget );
		const wrapper = widget.querySelector( '.elementor-social-icons-wrapper' );
		const ref = wrapper || widget;
		const r = ref.getBoundingClientRect();
		addBtn.classList.add( 'is-visible' );
		if ( items.length ) {
			const last = items[ items.length - 1 ];
			const lr = last.getBoundingClientRect();
			addBtn.style.top = ( lr.top + ( lr.height - addBtn.offsetHeight ) / 2 ) + 'px';
			addBtn.style.left = ( lr.right + 6 ) + 'px';
		} else {
			addBtn.style.top = ( r.top + 4 ) + 'px';
			addBtn.style.left = ( r.left + 4 ) + 'px';
		}
	}

	function hideAddBtn() {
		if ( addBtn ) { addBtn.classList.remove( 'is-visible' ); }
		addBtnWidget = null;
	}

	/* --- Action menu --- */
	let actionMenu = null;
	let menuWidget = null;
	let menuItem = null;
	let menuIndex = -1;

	function ensureActionMenu() {
		if ( actionMenu ) { return; }
		actionMenu = document.createElement( 'div' );
		actionMenu.className = 'ri2-action-menu ri2-ui';

		const iconBtn = document.createElement( 'button' );
		iconBtn.type = 'button';
		iconBtn.className = 'ri2-action-item';
		iconBtn.innerHTML = '<span class="dashicons dashicons-star-filled"></span> ' + ( RI.i18n.changeIcon || 'Change Icon' );
		iconBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			const w = menuWidget, i = menuIndex;
			hideActionMenu();
			if ( w && i >= 0 ) {
				RI.ctx( w ).replaceIcon( {
					key: findSocialKey( w ),
					itemIndex: i,
					kind: 'social-icons'
				} );
			}
		} );

		const linkBtn = document.createElement( 'button' );
		linkBtn.type = 'button';
		linkBtn.className = 'ri2-action-item';
		linkBtn.innerHTML = '<span class="dashicons dashicons-admin-links"></span> ' + ( RI.i18n.editLink || 'Edit Link' );
		linkBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			const w = menuWidget, it = menuItem, i = menuIndex;
			hideActionMenu();
			if ( w && it && i >= 0 ) {
				RI.ctx( w ).editLink( it, {
					key:        findSocialKey( w ),
					itemIndex: i,
					subField:   'link'
				} );
			}
		} );

		actionMenu.appendChild( iconBtn );
		actionMenu.appendChild( linkBtn );

		const delBtn = document.createElement( 'button' );
		delBtn.type = 'button';
		delBtn.className = 'ri2-action-item ri2-action-delete';
		delBtn.innerHTML = '<span class="dashicons dashicons-trash"></span> ' + ( RI.i18n.delete || 'Delete' );
		delBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			const w = menuWidget, i = menuIndex;
			hideActionMenu();
			if ( w && i >= 0 ) {
				const ctx = RI.ctx( w );
				ctx.toast( RI.i18n.saving || 'Saving…', 'saving' );
				ctx.deleteRepeaterItem( findSocialKey( w ), i )
					.then( function () {
						return ctx.refreshWidget();
					} )
					.then( function () {
						ctx.toast( RI.i18n.saved || 'Saved', 'ok' );
					} )
					.catch( function ( err ) {
						ctx.toast( ( err && err.message ) || ( RI.i18n.saveFailed || 'Save failed' ), 'error' );
					} );
			}
		} );
		actionMenu.appendChild( delBtn );

		actionMenu.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( actionMenu );

		// Click outside to close.
		document.addEventListener( 'click', function ( e ) {
			if ( ! actionMenu || ! actionMenu.classList.contains( 'is-visible' ) ) { return; }
			if ( e.target === actionMenu || actionMenu.contains( e.target ) ) { return; }
			hideActionMenu();
		}, true );
	}

	function showActionMenu( widget, item, idx ) {
		ensureActionMenu();
		hideEditOverlay();
		menuWidget = widget;
		menuItem = item;
		menuIndex = idx;
		const r = item.getBoundingClientRect();
		actionMenu.classList.add( 'is-visible' );
		const mw = actionMenu.offsetWidth;
		const mh = actionMenu.offsetHeight;
		let top = r.top + ( r.height - mh ) / 2;
		let left = r.left + ( r.width - mw ) / 2;
		if ( top < 4 ) { top = r.bottom + 4; }
		if ( top + mh > window.innerHeight - 4 ) { top = r.top - mh - 4; }
		if ( top < 4 ) { top = 4; }
		if ( left < 4 ) { left = 4; }
		if ( left + mw > window.innerWidth - 4 ) { left = window.innerWidth - mw - 4; }
		actionMenu.style.top = top + 'px';
		actionMenu.style.left = left + 'px';
	}

	function hideActionMenu() {
		if ( actionMenu ) { actionMenu.classList.remove( 'is-visible' ); }
		menuWidget = null;
		menuItem = null;
		menuIndex = -1;
	}

	function findSocialKey( widget ) {
		const ctx = RI.ctx( widget );
		const key = widget._ri2SocialKey;
		if ( key ) { return key; }
		ctx.getFields().then( function ( res ) {
			const f = findSocialField( res );
			if ( f ) { widget._ri2SocialKey = f.key; }
		} ).catch( function () {} );
		return 'social_icon_list';
	}

	function widgetOf( el ) {
		if ( ! el.closest ) { return null; }
		return el.closest( SELECTOR );
	}

	function findSocialField( res ) {
		return ( res.fields || [] ).filter( function ( f ) { return 'social-icons' === f.kind; } )[ 0 ];
	}

	function getItems( widget ) {
		return widget.querySelectorAll( '.elementor-social-icon' );
	}

	function itemIndexOf( widget, el ) {
		const items = getItems( widget );
		for ( let i = 0; i < items.length; i++ ) {
			if ( items[ i ] === el ) { return i; }
		}
		return -1;
	}

	function closestItem( el ) {
		return el.closest && el.closest( '.elementor-social-icon' );
	}

	/* --- Hover: show edit overlay centered on icon, and add-btn on widget --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( actionMenu && actionMenu.classList.contains( 'is-visible' ) ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }

		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( ! RI.isActive() ) { return; }
			if ( ! findSocialField( res ) ) { return; }

			// Show add-btn whenever hovering inside the widget.
			showAddBtn( widget );

			// If hovering a specific icon, also show the edit overlay.
			const item = closestItem( e.target );
			if ( item && widget.contains( item ) ) {
				showEditOverlay( widget, item );
			}
		} ).catch( function () {} );
	}, true );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		const to = e.relatedTarget;

		// Edit overlay leave logic.
		if ( hoveredItem ) {
			if ( to && ( to === editOverlay || ( editOverlay && editOverlay.contains( to ) ) ) ) { return; }
			if ( to && hoveredItem.contains( to ) ) { return; }
			clearTimeout( editLeaveTimer );
			editLeaveTimer = setTimeout( function () {
				if ( editOverlay && editOverlay.matches( ':hover' ) ) { return; }
				hideEditOverlay();
				hoveredItem = null;
			}, 80 );
		}

		// Add-btn leave logic.
		if ( addBtnWidget ) {
			if ( to && ( to === addBtn || ( addBtn && addBtn.contains( to ) ) ) ) { return; }
			if ( to && addBtnWidget.contains( to ) ) { return; }
			clearTimeout( addBtnTimer );
			addBtnTimer = setTimeout( function () {
				if ( addBtn && addBtn.matches( ':hover' ) ) { return; }
				hideAddBtn();
			}, 120 );
		}
	}, true );

	window.addEventListener( 'scroll', function () { hideEditOverlay(); hideActionMenu(); hideAddBtn(); }, true );
	window.addEventListener( 'resize', function () { hideEditOverlay(); hideActionMenu(); hideAddBtn(); } );

	/* --- Handler --- */
	const handler = {
		onClick: function ( event, widget, ctx ) {
			// Prevent link navigation while editing.
			const anchor = event.target.closest && event.target.closest( 'a' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			// If clicking the edit overlay, let its own handler fire.
			if ( event.target === editOverlay || ( editOverlay && editOverlay.contains( event.target ) ) ) {
				return;
			}

			// If clicking the add-btn, let its own handler fire.
			if ( event.target === addBtn || ( addBtn && addBtn.contains( event.target ) ) ) {
				return;
			}

			ctx.getFields().then( function ( res ) {
				const field = findSocialField( res );
				if ( ! field ) {
					ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
					return;
				}

				const item = closestItem( event.target );
				if ( ! item || ! widget.contains( item ) ) { return; }
				const idx = itemIndexOf( widget, item );
				if ( idx < 0 ) { return; }

				// Click social icon → show action menu.
				showActionMenu( widget, item, idx );
			} ).catch( function () {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'social-icons', handler );

} )( window.RomanInline2 );
