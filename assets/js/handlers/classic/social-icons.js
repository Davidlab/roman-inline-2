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

	var SELECTOR = '.elementor-widget-social-icons[data-id]';

	/* --- Edit pencil overlay --- */
	var editOverlay = null;
	var editLeaveTimer = null;
	var hoveredItem = null;
	var hoveredWidget = null;

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
				var idx = itemIndexOf( hoveredWidget, hoveredItem );
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
		var r = item.getBoundingClientRect();
		editOverlay.classList.add( 'is-visible' );
		var size = Math.min( r.width, r.height, 28 );
		editOverlay.style.width = size + 'px';
		editOverlay.style.height = size + 'px';
		editOverlay.style.top = ( r.top + ( r.height - size ) / 2 ) + 'px';
		editOverlay.style.left = ( r.left + ( r.width - size ) / 2 ) + 'px';
	}

	function hideEditOverlay() {
		if ( editOverlay ) { editOverlay.classList.remove( 'is-visible' ); }
	}

	/* --- Action menu --- */
	var actionMenu = null;
	var menuWidget = null;
	var menuItem = null;
	var menuIndex = -1;

	function ensureActionMenu() {
		if ( actionMenu ) { return; }
		actionMenu = document.createElement( 'div' );
		actionMenu.className = 'ri2-action-menu ri2-ui';

		var iconBtn = document.createElement( 'button' );
		iconBtn.type = 'button';
		iconBtn.className = 'ri2-action-item';
		iconBtn.innerHTML = '<span class="dashicons dashicons-star-filled"></span> ' + ( RI.i18n.changeIcon || 'Change Icon' );
		iconBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			var w = menuWidget, i = menuIndex;
			hideActionMenu();
			if ( w && i >= 0 ) {
				RI.ctx( w ).replaceIcon( {
					key: findSocialKey( w ),
					itemIndex: i,
					kind: 'social-icons'
				} );
			}
		} );

		var linkBtn = document.createElement( 'button' );
		linkBtn.type = 'button';
		linkBtn.className = 'ri2-action-item';
		linkBtn.innerHTML = '<span class="dashicons dashicons-admin-links"></span> ' + ( RI.i18n.editLink || 'Edit Link' );
		linkBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			var w = menuWidget, it = menuItem, i = menuIndex;
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

		var delBtn = document.createElement( 'button' );
		delBtn.type = 'button';
		delBtn.className = 'ri2-action-item ri2-action-delete';
		delBtn.innerHTML = '<span class="dashicons dashicons-trash"></span> ' + ( RI.i18n.delete || 'Delete' );
		delBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			var w = menuWidget, i = menuIndex;
			hideActionMenu();
			if ( w && i >= 0 ) {
				var ctx = RI.ctx( w );
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
		var r = item.getBoundingClientRect();
		actionMenu.classList.add( 'is-visible' );
		var mw = actionMenu.offsetWidth;
		var mh = actionMenu.offsetHeight;
		var top = r.top + ( r.height - mh ) / 2;
		var left = r.left + ( r.width - mw ) / 2;
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
		var ctx = RI.ctx( widget );
		var key = widget._ri2SocialKey;
		if ( key ) { return key; }
		ctx.getFields().then( function ( res ) {
			var f = findSocialField( res );
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
		var items = getItems( widget );
		for ( var i = 0; i < items.length; i++ ) {
			if ( items[ i ] === el ) { return i; }
		}
		return -1;
	}

	function closestItem( el ) {
		return el.closest && el.closest( '.elementor-social-icon' );
	}

	/* --- Hover: show edit overlay centered on icon --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( actionMenu && actionMenu.classList.contains( 'is-visible' ) ) { return; }
		var widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		var item = closestItem( e.target );
		if ( ! item || ! widget.contains( item ) ) { return; }

		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( ! RI.isActive() ) { return; }
			if ( findSocialField( res ) ) {
				showEditOverlay( widget, item );
			}
		} ).catch( function () {} );
	}, true );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! hoveredItem ) { return; }
		var to = e.relatedTarget;
		if ( to && ( to === editOverlay || ( editOverlay && editOverlay.contains( to ) ) ) ) { return; }
		if ( to && hoveredItem.contains( to ) ) { return; }
		clearTimeout( editLeaveTimer );
		editLeaveTimer = setTimeout( function () {
			if ( editOverlay && editOverlay.matches( ':hover' ) ) { return; }
			hideEditOverlay();
			hoveredItem = null;
		}, 80 );
	}, true );

	window.addEventListener( 'scroll', function () { hideEditOverlay(); hideActionMenu(); }, true );
	window.addEventListener( 'resize', function () { hideEditOverlay(); hideActionMenu(); } );

	/* --- Handler --- */
	var handler = {
		onClick: function ( event, widget, ctx ) {
			// Prevent link navigation while editing.
			var anchor = event.target.closest && event.target.closest( 'a' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			// If clicking the edit overlay, let its own handler fire.
			if ( event.target === editOverlay || ( editOverlay && editOverlay.contains( event.target ) ) ) {
				return;
			}

			ctx.getFields().then( function ( res ) {
				var field = findSocialField( res );
				if ( ! field ) {
					ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
					return;
				}

				var item = closestItem( event.target );
				if ( ! item || ! widget.contains( item ) ) { return; }
				var idx = itemIndexOf( widget, item );
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
