/**
 * Roman Inline 2 — Classic image widget handler.
 *
 * Hover shows a floating "Change Image" button, click the button or the
 * image itself to swap via the WordPress media library.
 * Uses key-based image saving (settings[key] = {id, url, alt}).
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	var btn = null;
	var hoveredImg = null;
	var leaveTimer = null;

	function findImageField( res ) {
		return ( res.fields || [] ).filter( function ( f ) { return 'image' === f.kind; } )[ 0 ];
	}

	function widgetOf( el ) {
		return el.closest && el.closest( '.elementor-widget[data-id]' );
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
				isAtomic: false
			} );
		} );
	}

	function ensureBtn() {
		if ( btn ) { return; }
		btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'ri2-imgbtn ri2-ui';
		btn.innerHTML = '<span class="dashicons dashicons-format-image"></span> ' + ( RI.i18n.changeImage || 'Change Image' );
		btn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( leaveTimer );
			if ( hoveredImg ) {
				var img = hoveredImg;
				hideBtn();
				var widget = widgetOf( img );
				if ( widget ) {
					doReplace( img, RI.ctx( widget ) );
				}
			}
		} );
		btn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( btn );
	}

	function showBtn( img ) {
		ensureBtn();
		clearTimeout( leaveTimer );
		hoveredImg = img;
		var r = img.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideBtn(); return; }
		btn.style.top = ( r.top + 8 ) + 'px';
		btn.style.left = ( r.left + 8 ) + 'px';
		btn.classList.add( 'is-visible' );
	}

	function hideBtn() {
		if ( btn ) { btn.classList.remove( 'is-visible' ); }
	}

	function reallyHideBtn() {
		hideBtn();
		hoveredImg = null;
	}

	/* --- Image hover (direct mouseover/mouseout on IMG elements) --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( 'IMG' !== e.target.tagName ) { return; }
		var widget = widgetOf( e.target );
		if ( ! widget ) { return; }

		// Only show for classic widgets (not atomic, which has its own handler).
		var et = widget.getAttribute( 'data-e-type' ) || '';
		if ( et.indexOf( 'e-' ) === 0 ) { return; }

		// Only show for classic image widgets — skip other classic widget types.
		var wt = ( widget.getAttribute( 'data-widget_type' ) || '' ).split( '.' )[ 0 ];
		if ( wt && 'image' !== wt ) { return; }

		// Verify the widget has an editable image field.
		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( ! RI.isActive() ) { return; }
			if ( findImageField( res ) ) {
				showBtn( e.target );
			}
		} ).catch( function () {} );
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! hoveredImg ) { return; }
		if ( e.relatedTarget && e.relatedTarget === btn ) { return; }
		if ( btn && btn.contains( e.relatedTarget ) ) { return; }
		clearTimeout( leaveTimer );
		leaveTimer = setTimeout( function () {
			if ( btn && btn.matches( ':hover' ) ) { return; }
			reallyHideBtn();
		}, 60 );
	} );

	window.addEventListener( 'scroll', function () { reallyHideBtn(); }, true );
	window.addEventListener( 'resize', function () { reallyHideBtn(); } );

	/* --- Classic image widget handler --- */
	var handler = {
		onClick: function ( event, widget, ctx ) {
			var img = widget.querySelector( 'img' );
			if ( ! img ) { return; }
			if ( event.target !== img && ! img.contains( event.target ) ) { return; }
			hideBtn();
			doReplace( img, ctx );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'image', handler );

} )( window.RomanInline2 );
