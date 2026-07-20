/**
 * Roman Inline 2 — Atomic e-image widget handler.
 *
 * Hover shows a floating "Change Image" button, click the button or the
 * image itself to swap via the WordPress media library.
 * Classic image widget will have its own handler file when implemented.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	var btn = null;
	var hoveredImg = null;

	function findImageField( res ) {
		return ( res.fields || [] ).filter( function ( f ) { return 'image' === f.kind; } )[ 0 ];
	}

	function doReplace( img, ctx ) {
		ctx.getFields().then( function ( res ) {
			var field = findImageField( res );
			if ( ! field ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}
			ctx.replaceImage( img, {
				key:      field.key,
				isAtomic: true
			} );
		} );
	}

	function ensureBtn() {
		if ( btn ) { return; }
		btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'ri2-imgbtn ri2-ui';
		btn.innerHTML = '<span class="dashicons dashicons-format-image"></span> ' + 'Change Image';
		btn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			if ( hoveredImg ) {
				var img = hoveredImg;
				hideBtn();
				var widget = widgetOf( img ) || img;
				doReplace( img, RI.ctx( widget ) );
			}
		} );
		btn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( btn );
	}

	function widgetOf( el ) {
		return el.closest && el.closest( '[data-id]' );
	}

	function showBtn( img ) {
		ensureBtn();
		hoveredImg = img;
		var r = img.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideBtn(); return; }
		btn.style.top = ( r.top + 8 ) + 'px';
		btn.style.left = ( r.left + 8 ) + 'px';
		btn.classList.add( 'is-visible' );
	}

	function hideBtn() {
		if ( btn ) { btn.classList.remove( 'is-visible' ); }
		hoveredImg = null;
	}

	/* --- Image hover (direct mouseover/mouseout on IMG elements) --- */
	// Separate from the widget handler system to avoid flicker when
	// crossing widget boundaries.
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( 'IMG' !== e.target.tagName ) { return; }
		var widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		// Only show for atomic widgets — classic widgets have their own handlers.
		var et = widget.getAttribute( 'data-e-type' ) || '';
		if ( et.indexOf( 'e-' ) !== 0 ) { return; }
		showBtn( e.target );
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! hoveredImg ) { return; }
		if ( e.relatedTarget && e.relatedTarget === btn ) { return; }
		if ( btn && btn.contains( e.relatedTarget ) ) { return; }
		setTimeout( function () {
			if ( btn && ! btn.matches( ':hover' ) ) { hideBtn(); }
		}, 60 );
	} );

	window.addEventListener( 'scroll', function () { hideBtn(); }, true );
	window.addEventListener( 'resize', function () { hideBtn(); } );

	/* --- Atomic e-image handler --- */
	// Atomic e-image: the widget element IS the <img> (carries data-e-type/data-id).
	var handler = {
		onClick: function ( event, widget, ctx ) {
			var img = ( 'IMG' === widget.tagName ) ? widget : widget.querySelector( 'img' );
			if ( ! img ) { return; }
			if ( event.target !== img && ! img.contains( event.target ) ) { return; }
			hideBtn();
			doReplace( img, ctx );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'e-image', handler );

} )( window.RomanInline2 );
