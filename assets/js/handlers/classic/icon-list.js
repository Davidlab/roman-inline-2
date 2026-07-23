/**
 * Roman Inline 2 — Classic icon-list widget handler.
 *
 * The Icon List widget renders a <ul> of <li> items, each with:
 *   - <span class="elementor-icon-list-icon"> containing an <i> (Font Awesome)
 *   - <span class="elementor-icon-list-text"> containing the text
 *   - optionally wrapped in an <a> link
 *
 * Interactions:
 *   - Click the text → inline edit (text, no toolbar)
 *   - Click the icon → opens icon picker popover
 *   - Hover an item → floating link button to add/edit link
 *   - Click the link (on the <a>) → link popover
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	var SELECTOR = '.elementor-widget-icon-list[data-id]';

	/* --- Floating link button --- */
	var linkBtn = null;
	var linkLeaveTimer = null;
	var hoveredItem = null;
	var hoveredWidget = null;

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
			if ( hoveredItem && hoveredWidget ) {
				var idx = itemIndexOf( hoveredWidget, hoveredItem );
				if ( idx >= 0 ) {
					RI.ctx( hoveredWidget ).editLink( hoveredItem, {
						key:        findIconListKey( hoveredWidget ),
						itemIndex: idx,
						subField:   'link'
					} );
				}
			}
		} );
		linkBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( linkBtn );
	}

	function showLinkBtn( widget, item ) {
		ensureLinkBtn();
		clearTimeout( linkLeaveTimer );
		hoveredItem = item;
		hoveredWidget = widget;
		var r = item.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideLinkBtn(); return; }
		linkBtn.classList.add( 'is-visible' );
		linkBtn.style.top = ( r.top + ( r.height - linkBtn.offsetHeight ) / 2 ) + 'px';
		linkBtn.style.left = ( r.right - linkBtn.offsetWidth - 4 ) + 'px';
	}

	function hideLinkBtn() {
		if ( linkBtn ) { linkBtn.classList.remove( 'is-visible' ); }
	}

	function findIconListKey( widget ) {
		// Cached lookup — the field key is always 'icon_list' for this widget,
		// but we verify via getFields to be safe.
		var ctx = RI.ctx( widget );
		var key = widget._ri2IconListKey;
		if ( key ) { return key; }
		ctx.getFields().then( function ( res ) {
			var f = findIconListField( res );
			if ( f ) { widget._ri2IconListKey = f.key; }
		} ).catch( function () {} );
		return 'icon_list';
	}

	function widgetOf( el ) {
		if ( ! el.closest ) { return null; }
		return el.closest( SELECTOR );
	}

	function findIconListField( res ) {
		return ( res.fields || [] ).filter( function ( f ) { return 'icon-list' === f.kind; } )[ 0 ];
	}

	function getItems( widget ) {
		return widget.querySelectorAll( '.elementor-icon-list-item' );
	}

	function itemIndexOf( widget, el ) {
		var items = getItems( widget );
		for ( var i = 0; i < items.length; i++ ) {
			if ( items[ i ] === el ) { return i; }
		}
		return -1;
	}

	function closestItem( el ) {
		return el.closest && el.closest( '.elementor-icon-list-item' );
	}

	/* --- Hover: show link button per item --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		var widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		var item = closestItem( e.target );
		if ( ! item || ! widget.contains( item ) ) { return; }

		// Don't show link button when hovering the icon itself (that opens icon picker).
		var iconWrap = item.querySelector( '.elementor-icon-list-icon' );
		if ( iconWrap && ( e.target === iconWrap || iconWrap.contains( e.target ) ) ) { return; }

		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( ! RI.isActive() ) { return; }
			if ( findIconListField( res ) ) {
				showLinkBtn( widget, item );
			}
		} ).catch( function () {} );
	}, true );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! hoveredItem ) { return; }
		var to = e.relatedTarget;
		if ( to && ( to === linkBtn || ( linkBtn && linkBtn.contains( to ) ) ) ) { return; }
		if ( to && hoveredItem.contains( to ) ) { return; }
		clearTimeout( linkLeaveTimer );
		linkLeaveTimer = setTimeout( function () {
			if ( linkBtn && linkBtn.matches( ':hover' ) ) { return; }
			hideLinkBtn();
			hoveredItem = null;
		}, 80 );
	}, true );

	window.addEventListener( 'scroll', function () { hideLinkBtn(); }, true );
	window.addEventListener( 'resize', function () { hideLinkBtn(); } );

	/* --- Handler --- */
	var handler = {
		onClick: function ( event, widget, ctx ) {
			// Prevent link navigation while editing.
			var anchor = event.target.closest && event.target.closest( 'a' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			ctx.getFields().then( function ( res ) {
				var field = findIconListField( res );
				if ( ! field ) {
					ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
					return;
				}

				var item = closestItem( event.target );
				if ( ! item || ! widget.contains( item ) ) { return; }
				var idx = itemIndexOf( widget, item );
				if ( idx < 0 ) { return; }

				// Icon click → open icon picker.
				var iconWrap = item.querySelector( '.elementor-icon-list-icon' );
				if ( iconWrap && ( event.target === iconWrap || iconWrap.contains( event.target ) ) ) {
					ctx.replaceIcon( { key: field.key, itemIndex: idx } );
					return;
				}

				// Text click → inline edit.
				var textEl = item.querySelector( '.elementor-icon-list-text' );
				if ( textEl && ( event.target === textEl || textEl.contains( event.target ) ) ) {
					ctx.editText( textEl, {
						key:        field.key,
						kind:       'text',
						itemIndex: idx,
						subField:   'text'
					} );
					return;
				}

				// Link click → edit link (if the item has a link).
				if ( anchor && item.contains( anchor ) ) {
					ctx.editLink( anchor, {
						key:        field.key,
						itemIndex: idx,
						subField:   'link'
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

	RI.register( 'icon-list', handler );

} )( window.RomanInline2 );
