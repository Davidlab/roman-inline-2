/**
 * Roman Inline 2 — Atomic e-self-hosted-video widget handler.
 *
 * Hover shows floating "Change Video" and "Change Poster" buttons.
 * Click "Change Video" or the video element to swap via the WP media library.
 * Click "Change Poster" to swap the poster image via the WP media library.
 * Classic video widget will have its own handler file when implemented.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	var vidBtn = null;
	var posterBtn = null;
	var btnWidget = null;
	var leaveTimer = null;
	var TYPE = 'e-self-hosted-video';

	function findVideoField( res ) {
		return ( res.fields || [] ).filter( function ( f ) {
			return 'video' === f.kind && 'media' === ( f.source_type || 'media' );
		} )[ 0 ];
	}

	function findPosterField( res ) {
		return ( res.fields || [] ).filter( function ( f ) {
			return 'image' === f.kind && 'poster' === f.key;
		} )[ 0 ];
	}

	function doReplaceVideo( widget, ctx ) {
		ctx.getFields().then( function ( res ) {
			var field = findVideoField( res );
			if ( ! field ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}
			ctx.replaceVideo( widget, {
				key:         field.key,
				source_type: field.source_type || 'media',
				isAtomic:    true
			} );
		} );
	}

	function doReplacePoster( widget, ctx ) {
		ctx.getFields().then( function ( res ) {
			var field = findPosterField( res );
			if ( ! field ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}
			ctx.replaceImage( widget, {
				key:      field.key,
				isAtomic: true
			} );
		} );
	}

	function widgetOf( el ) {
		return el.closest && el.closest( '[data-e-type="' + TYPE + '"][data-id]' );
	}

	function makeBtn( text, icon, onClick ) {
		var b = document.createElement( 'button' );
		b.type = 'button';
		b.className = 'ri2-vidbtn ri2-ui';
		b.innerHTML = '<span class="dashicons dashicons-' + icon + '"></span> ' + text;
		b.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( leaveTimer );
			if ( btnWidget ) {
				var widget = btnWidget;
				hideBtns();
				onClick( widget, RI.ctx( widget ) );
			}
		} );
		b.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		b.addEventListener( 'mouseover', function () {
			clearTimeout( leaveTimer );
		} );
		b.addEventListener( 'mouseout', function () {
			leaveTimer = setTimeout( reallyHideBtn, 100 );
		} );
		document.body.appendChild( b );
		return b;
	}

	function ensureBtns() {
		if ( ! vidBtn ) {
			vidBtn = makeBtn( 'Change Video', 'video-alt3', doReplaceVideo );
		}
		if ( ! posterBtn ) {
			posterBtn = makeBtn( 'Change Poster', 'format-image', doReplacePoster );
		}
	}

	function showBtns( widget, hasPoster ) {
		ensureBtns();
		clearTimeout( leaveTimer );
		btnWidget = widget;
		var r = widget.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideBtns(); return; }
		vidBtn.style.top = ( r.top + 8 ) + 'px';
		vidBtn.style.left = ( r.left + 8 ) + 'px';
		vidBtn.classList.add( 'is-visible' );
		if ( hasPoster ) {
			posterBtn.style.top = ( r.top + 8 ) + 'px';
			posterBtn.style.left = ( r.left + vidBtn.offsetWidth + 12 ) + 'px';
			posterBtn.classList.add( 'is-visible' );
		} else {
			posterBtn.classList.remove( 'is-visible' );
		}
	}

	function hideBtns() {
		if ( vidBtn ) { vidBtn.classList.remove( 'is-visible' ); }
		if ( posterBtn ) { posterBtn.classList.remove( 'is-visible' ); }
	}

	function reallyHideBtn() {
		hideBtns();
		btnWidget = null;
	}

	function isOurBtn( el ) {
		return el === vidBtn || el === posterBtn ||
			( vidBtn && vidBtn.contains( el ) ) ||
			( posterBtn && posterBtn.contains( el ) );
	}

	/* --- Video widget hover (direct mouseover/mouseout, like image.js) --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		var widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( widgetOf( e.target ) !== widget ) { return; }
			var hasVideo = findVideoField( res );
			if ( ! hasVideo ) { return; }
			showBtns( widget, !! findPosterField( res ) );
		} );
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! btnWidget ) { return; }
		if ( e.relatedTarget && isOurBtn( e.relatedTarget ) ) { return; }
		leaveTimer = setTimeout( function () {
			if ( ! vidBtn || ! vidBtn.matches( ':hover' ) ) {
				if ( ! posterBtn || ! posterBtn.matches( ':hover' ) ) {
					reallyHideBtn();
				}
			}
		}, 100 );
	} );

	window.addEventListener( 'scroll', function () { reallyHideBtn(); }, true );
	window.addEventListener( 'resize', function () { reallyHideBtn(); } );

	var handler = {
		onClick: function ( event, widget, ctx ) {
			reallyHideBtn();
			doReplaceVideo( widget, ctx );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( TYPE, handler );

} )( window.RomanInline2 );
