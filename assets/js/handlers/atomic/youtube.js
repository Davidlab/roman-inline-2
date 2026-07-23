/**
 * Roman Inline 2 — Atomic e-youtube widget handler.
 *
 * Hover shows a floating "Edit Video URL" button. Click the button or the
 * widget to open a URL popover for changing the YouTube/Vimeo URL.
 * The atomic YouTube widget uses a 'source' string prop (not video-src),
 * so source_type is 'url'.
 * Classic YouTube widget will have its own handler file when implemented.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	let btn = null;
	let btnWidget = null;
	let leaveTimer = null;
	const TYPE = 'e-youtube';

	function findVideoField( res ) {
		return ( res.fields || [] ).filter( function ( f ) {
			return 'video' === f.kind;
		} )[ 0 ];
	}

	function doEdit( widget, ctx ) {
		ctx.getFields().then( function ( res ) {
			const field = findVideoField( res );
			if ( ! field ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}
			ctx.replaceVideo( widget, {
				key:         field.key,
				source_type: field.source_type || 'url',
				isAtomic:    true,
				value:       field.value || '',
				label:       field.label || 'Video URL'
			} );
		} );
	}

	function widgetOf( el ) {
		return el.closest && el.closest( '[data-e-type="' + TYPE + '"][data-id]' );
	}

	function ensureBtn() {
		if ( btn ) { return; }
		btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'ri2-vidbtn ri2-ui';
		btn.innerHTML = '<span class="dashicons dashicons-video-alt3"></span> ' + 'Edit Video URL';
		btn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( leaveTimer );
			if ( btnWidget ) {
				const widget = btnWidget;
				hideBtn();
				doEdit( widget, RI.ctx( widget ) );
			}
		} );
		btn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		btn.addEventListener( 'mouseover', function () {
			clearTimeout( leaveTimer );
		} );
		btn.addEventListener( 'mouseout', function () {
			leaveTimer = setTimeout( reallyHideBtn, 100 );
		} );
		document.body.appendChild( btn );
	}

	function showBtn( widget ) {
		ensureBtn();
		clearTimeout( leaveTimer );
		btnWidget = widget;
		const r = widget.getBoundingClientRect();
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
		btnWidget = null;
	}

	/* --- YouTube widget hover (direct mouseover/mouseout, like image.js) --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( findVideoField( res ) && widgetOf( e.target ) === widget ) {
				showBtn( widget );
			}
		} );
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! btnWidget ) { return; }
		if ( e.relatedTarget && e.relatedTarget === btn ) { return; }
		if ( btn && btn.contains( e.relatedTarget ) ) { return; }
		leaveTimer = setTimeout( function () {
			if ( btn && ! btn.matches( ':hover' ) ) { reallyHideBtn(); }
		}, 100 );
	} );

	window.addEventListener( 'scroll', function () { reallyHideBtn(); }, true );
	window.addEventListener( 'resize', function () { reallyHideBtn(); } );

	const handler = {
		onClick: function ( event, widget, ctx ) {
			reallyHideBtn();
			doEdit( widget, ctx );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( TYPE, handler );

} )( window.RomanInline2 );
