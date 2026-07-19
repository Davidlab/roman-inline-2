/**
 * Roman Inline 2 — Atomic container background handler.
 *
 * Handles e-flexbox and e-div-block atomic elements.
 * Hover shows a floating "Change Background" button in the top-right corner.
 * Click opens the WP media library to swap the background image.
 * Background images live in the styles tree (not settings props).
 *
 * Pattern follows the original roman-inline plugin: single mouseover/mouseout
 * pair on document, async field fetch with :hover re-check, 60ms hide timer.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	var btn = null;
	var btnWidget = null;
	var leaveTimer = null;
	var SELECTOR = '[data-e-type="e-flexbox"][data-id], [data-e-type="e-div-block"][data-id]';

	function findBgField( res ) {
		return ( res.fields || [] ).filter( function ( f ) {
			return 'background' === f.kind;
		} )[ 0 ];
	}

	function doReplace( widget, ctx ) {
		ctx.getFields().then( function ( res ) {
			var field = findBgField( res );
			if ( ! field ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}
			ctx.replaceBackground( {
				style_id:      field.style_id,
				variant_index: field.variant_index,
				overlay_index: field.overlay_index
			} );
		} ).catch( function () {} );
	}

	function widgetOf( el ) {
		return el.closest ? el.closest( SELECTOR ) : null;
	}

	function ensureBtn() {
		if ( btn ) { return; }
		btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'ri2-bgbtn ri2-ui';
		btn.innerHTML = '<span class="dashicons dashicons-format-image"></span>';
		btn.title = RI.i18n.changeBg || 'Change Background';
		btn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( leaveTimer );
			if ( btnWidget ) {
				var widget = btnWidget;
				hideBtn();
				doReplace( widget, RI.ctx( widget ) );
			}
		} );
		btn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( btn );
	}

	function showBtn( widget ) {
		ensureBtn();
		clearTimeout( leaveTimer );
		btnWidget = widget;
		var r = widget.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideBtn(); return; }
		btn.style.top = ( r.top + 6 ) + 'px';
		btn.style.left = ( r.right - 34 ) + 'px';
		btn.classList.add( 'is-visible' );
	}

	function hideBtn() {
		if ( btn ) { btn.classList.remove( 'is-visible' ); }
	}

	function reallyHideBtn() {
		hideBtn();
		btnWidget = null;
	}

	/* --- Container hover (direct mouseover/mouseout, like original RI) --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }

		// Check if the hovered element (or an ancestor) is a flexbox/div-block.
		var widget = widgetOf( e.target );
		if ( widget ) {
			RI.ctx( widget ).getFields().then( function ( res ) {
				if ( ! RI.isActive() || ! widget.matches( ':hover' ) ) { return; }
				if ( findBgField( res ) ) {
					showBtn( widget );
				}
			} ).catch( function () {} );
			return;
		}

		// Also check ancestors — hovering a child widget inside a container
		// with a background should still show the bg button (like original RI).
		var ancestor = e.target.parentElement ? e.target.parentElement.closest( SELECTOR ) : null;
		while ( ancestor ) {
			(function ( anc ) {
				RI.ctx( anc ).getFields().then( function ( res ) {
					if ( ! RI.isActive() || ! anc.matches( ':hover' ) ) { return; }
					if ( findBgField( res ) ) {
						showBtn( anc );
					}
				} ).catch( function () {} );
			})( ancestor );
			ancestor = ancestor.parentElement ? ancestor.parentElement.closest( SELECTOR ) : null;
		}
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! btnWidget ) { return; }
		if ( e.relatedTarget && e.relatedTarget === btn ) { return; }
		if ( btn && btn.contains( e.relatedTarget ) ) { return; }
		// If the mouse is still within the hovered widget, don't hide.
		if ( btnWidget && e.relatedTarget && btnWidget.contains( e.relatedTarget ) ) { return; }
		clearTimeout( leaveTimer );
		leaveTimer = setTimeout( function () {
			if ( btnWidget && btnWidget.matches( ':hover' ) ) { return; }
			if ( btn && btn.matches( ':hover' ) ) { return; }
			reallyHideBtn();
		}, 60 );
	} );

	window.addEventListener( 'scroll', function () { reallyHideBtn(); }, true );
	window.addEventListener( 'resize', function () { reallyHideBtn(); } );

	/* --- Register no-op handlers for both atomic container types --- */
	var handler = {
		onClick: function () {},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'e-flexbox', handler );
	RI.register( 'e-div-block', handler );

} )( window.RomanInline2 );
