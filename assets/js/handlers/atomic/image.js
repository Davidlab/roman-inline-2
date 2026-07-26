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

	let btn = null;
	let hoveredImg = null;
	let leaveTimer = null;

	function findImageField( res ) {
		return ( res.fields || [] ).filter( function ( f ) { return 'image' === f.kind; } )[ 0 ];
	}

	function doReplace( img, ctx ) {
		ctx.getFields().then( function ( res ) {
			const field = findImageField( res );
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
			clearTimeout( leaveTimer );
			if ( hoveredImg ) {
				const img = hoveredImg;
				hideBtn();
				const widget = widgetOf( img ) || img;
				doReplace( img, RI.ctx( widget ) );
			}
		} );
		btn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( btn );
	}

	function widgetOf( el ) {
		return el.closest && el.closest( '[data-id]' );
	}

	function imgOf( widget ) {
		return ( 'IMG' === widget.tagName ) ? widget : widget.querySelector( 'img' );
	}

	function showBtn( img ) {
		ensureBtn();
		// Cancel any pending hide from a previous mouseout, otherwise it fires
		// ~60ms later and hides the button we are showing right now.
		clearTimeout( leaveTimer );
		hoveredImg = img;
		const r = img.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) {
			// A freshly re-rendered image has no size until it loads. Give up for
			// now, but measure again once it does so the button still appears
			// without needing the pointer to leave and re-enter the image.
			if ( ! img.complete ) {
				img.addEventListener( 'load', function () {
					if ( RI.isActive() && img.matches( ':hover' ) ) { showBtn( img ); }
				}, { once: true } );
			}
			hideBtn();
			return;
		}
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
	function handleHoverTarget( target ) {
		if ( ! RI.isActive() ) { return; }
		const widget = widgetOf( target );
		if ( ! widget ) { return; }
		// Only show for atomic widgets — classic widgets have their own handlers.
		const et = widget.getAttribute( 'data-e-type' ) || '';
		if ( et.indexOf( 'e-' ) !== 0 ) { return; }
		// The target is usually the <img>, but the wrapper element added around
		// atomic widget output can also receive the event when the image does
		// not fill it. Only fall back to the widget's image for e-image itself,
		// so hovering a container that merely holds an image does nothing.
		if ( 'IMG' === target.tagName ) {
			showBtn( target );
			return;
		}
		if ( 'e-image' !== et ) { return; }
		const img = imgOf( widget );
		if ( img ) { showBtn( img ); }
	}

	document.addEventListener( 'mouseover', function ( e ) {
		handleHoverTarget( e.target );
	} );

	// Saving swaps the whole widget element for freshly rendered markup, which
	// can happen under a stationary cursor. No mouseover fires in that case, so
	// the first pointer movement has to be able to bring the button back.
	document.addEventListener( 'mousemove', function ( e ) {
		if ( hoveredImg ) { return; }
		handleHoverTarget( e.target );
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! hoveredImg ) { return; }
		if ( e.relatedTarget && e.relatedTarget === btn ) { return; }
		if ( btn && btn.contains( e.relatedTarget ) ) { return; }
		clearTimeout( leaveTimer );
		leaveTimer = setTimeout( function () {
			if ( btn && btn.matches( ':hover' ) ) { return; }
			hideBtn();
		}, 60 );
	} );

	window.addEventListener( 'scroll', function () { clearTimeout( leaveTimer ); hideBtn(); }, true );
	window.addEventListener( 'resize', function () { clearTimeout( leaveTimer ); hideBtn(); } );

	/* --- Atomic e-image handler --- */
	// Atomic e-image: the widget element IS the <img> (carries data-e-type/data-id).
	const handler = {
		onClick: function ( event, widget, ctx ) {
			const img = ( 'IMG' === widget.tagName ) ? widget : widget.querySelector( 'img' );
			if ( ! img ) { return; }
			if ( event.target !== img && ! img.contains( event.target ) ) { return; }
			hideBtn();
			doReplace( img, ctx );
		},
		// Core resolves the widget here with the same lookup that drives onClick,
		// so this fires reliably even when the direct mouseover listener above
		// never sees the <img> as the event target.
		onHover: function ( event, widget ) {
			const img = imgOf( widget );
			if ( img ) { showBtn( img ); }
		},
		// Hiding is handled by the local mouseout listener, which knows to keep
		// the button alive while the pointer is over the button itself.
		onLeave: function () {}
	};

	RI.register( 'e-image', handler );

} )( window.RomanInline2 );
