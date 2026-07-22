/**
 * Roman Inline 2 — Classic icon-box widget handler.
 *
 * - Click the icon → opens icon picker popover (Font Awesome libraries).
 * - Click the title → inline edit (text, no toolbar).
 * - Click the description → inline edit (rich-text toolbar).
 * - Hover the widget → small link icon button (top-right) to edit the box link.
 *
 * Field detection uses markers (data-elementor-setting-key) for title/description,
 * introspection (ICONS control) for the icon, and classic_link() for the link.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	/* --- Floating link icon button --- */
	var linkBtn = null;
	var linkLeaveTimer = null;

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
			var w = linkBtn._widget;
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
		var r = widget.getBoundingClientRect();
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
		return el.closest && el.closest( '.elementor-widget-icon-box[data-id]' );
	}

	function findField( res, kind ) {
		return ( res.fields || [] ).filter( function ( f ) { return kind === f.kind; } )[ 0 ];
	}

	/* --- Widget hover for link button --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		var widget = widgetOf( e.target );
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
		var widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		clearTimeout( linkLeaveTimer );
		linkLeaveTimer = setTimeout( function () {
			if ( linkBtn && linkBtn.matches( ':hover' ) ) { return; }
			hideLinkBtn();
		}, 100 );
	}, true );

	window.addEventListener( 'scroll', function () {
		hideLinkBtn();
	}, true );
	window.addEventListener( 'resize', function () {
		hideLinkBtn();
	} );

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
				var fields = res.fields || [];

				// Icon click → open icon picker.
				var iconWrap = widget.querySelector( '.elementor-icon-box-icon' );
				if ( iconWrap && ( event.target === iconWrap || iconWrap.contains( event.target ) ) ) {
					var iconField = fields.filter( function ( f ) { return 'icon' === f.kind; } )[ 0 ];
					if ( iconField ) {
						ctx.replaceIcon( { key: iconField.key } );
						return;
					}
				}

				// Title click → inline edit (text kind, no toolbar).
				var titleEl = widget.querySelector( '.elementor-icon-box-title' );
				if ( titleEl && ( event.target === titleEl || titleEl.contains( event.target ) ) ) {
					var titleField = fields.filter( function ( f ) { return 'title_text' === f.key; } )[ 0 ];
					if ( titleField ) {
						ctx.editText( titleEl, {
							key:      titleField.key,
							kind:     'text',
							isAtomic: false
						} );
						return;
					}
				}

				// Description click → inline edit (rich_text toolbar).
				var descEl = widget.querySelector( '.elementor-icon-box-description' );
				if ( descEl && ( event.target === descEl || descEl.contains( event.target ) ) ) {
					var descField = fields.filter( function ( f ) { return 'description_text' === f.key; } )[ 0 ];
					if ( descField ) {
						ctx.editText( descEl, {
							key:      descField.key,
							kind:     'rich_text',
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

	RI.register( 'icon-box', handler );

} )( window.RomanInline2 );
