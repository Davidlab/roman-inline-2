/**
 * Roman Inline 2 — Classic video widget handler.
 *
 * Elementor's classic Video widget supports multiple source types:
 *   - YouTube, Vimeo, Dailymotion, etc. (URL-based, via popover)
 *   - Self-hosted (media library or external URL)
 *
 * Hover shows floating buttons:
 *   - "Edit Video" — opens a source-type selection popover where the user
 *     chooses between "Video URL" (URL popover) and "Self Hosted"
 *     (WP media library).
 *   - "Change Poster" / "Change Overlay" — opens WP media library for the
 *     poster or overlay image (if present).
 *
 * Click the video element itself opens the source-type selection popover.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	var vidBtn = null;
	var posterBtn = null;
	var btnWidget = null;
	var leaveTimer = null;
	var srcPop = null;
	var TYPE = 'video';

	function findVideoField( res ) {
		return ( res.fields || [] ).filter( function ( f ) {
			return 'video' === f.kind;
		} )[ 0 ];
	}

	function findPosterField( res ) {
		return ( res.fields || [] ).filter( function ( f ) {
			return 'poster' === f.kind;
		} )[ 0 ];
	}

	function doEditVideoUrl( widget, ctx ) {
		ctx.getFields().then( function ( res ) {
			var field = findVideoField( res );
			if ( ! field ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}
			ctx.replaceVideo( widget, {
				key:         field.key,
				source_type: 'url',
				isAtomic:    false,
				label:       field.label,
				value:       field.value
			} );
		} );
	}

	function doChangeVideo( widget, ctx ) {
		ctx.getFields().then( function ( res ) {
			var field = findVideoField( res );
			if ( ! field ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}
			ctx.replaceVideo( widget, {
				key:         field.key,
				source_type: 'media',
				isAtomic:    false
			} );
		} );
	}

	function closeSrcPop() {
		if ( srcPop && srcPop.parentNode ) { srcPop.parentNode.removeChild( srcPop ); }
		srcPop = null;
	}

	function openSrcPop( widget, ctx ) {
		closeSrcPop();
		srcPop = document.createElement( 'div' );
		srcPop.className = 'ri2-vidpop ri2-srcpop ri2-ui';
		var inner = document.createElement( 'div' );
		inner.className = 'ri2-srcpop__inner';

		var title = document.createElement( 'div' );
		title.className = 'ri2-vidpop__title';
		title.textContent = 'Choose Video Source';
		inner.appendChild( title );

		var urlOpt = document.createElement( 'button' );
		urlOpt.type = 'button';
		urlOpt.className = 'ri2-srcpop__opt';
		urlOpt.innerHTML = '<span class="dashicons dashicons-video-alt3"></span> Video URL';
		urlOpt.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		urlOpt.addEventListener( 'click', function () {
			closeSrcPop();
			doEditVideoUrl( widget, ctx );
		} );

		var mediaOpt = document.createElement( 'button' );
		mediaOpt.type = 'button';
		mediaOpt.className = 'ri2-srcpop__opt';
		mediaOpt.innerHTML = '<span class="dashicons dashicons-video-alt3"></span> Self Hosted';
		mediaOpt.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		mediaOpt.addEventListener( 'click', function () {
			closeSrcPop();
			doChangeVideo( widget, ctx );
		} );

		var cancel = document.createElement( 'button' );
		cancel.type = 'button';
		cancel.className = 'ri2-vidpop__cancel';
		cancel.textContent = ctx.i18n.cancel || 'Cancel';
		cancel.addEventListener( 'click', closeSrcPop );

		inner.appendChild( urlOpt );
		inner.appendChild( mediaOpt );
		var actions = document.createElement( 'div' );
		actions.className = 'ri2-vidpop__actions';
		actions.appendChild( cancel );
		inner.appendChild( actions );

		srcPop.appendChild( inner );
		document.body.appendChild( srcPop );

		// Close on outside click.
		setTimeout( function () {
			document.addEventListener( 'mousedown', outsideClose, true );
		}, 0 );
	}

	function outsideClose( e ) {
		if ( srcPop && ! srcPop.contains( e.target ) ) {
			closeSrcPop();
			document.removeEventListener( 'mousedown', outsideClose, true );
		}
	}

	function doReplacePoster( widget, ctx ) {
		ctx.getFields().then( function ( res ) {
			var field = findPosterField( res );
			if ( ! field ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}
			ctx.replacePoster( {
				key:      field.key,
				isAtomic: false
			} );
		} );
	}

	function widgetOf( el ) {
		if ( ! el.closest ) { return null; }
		var w = el.closest( '.elementor-widget-video' );
		if ( w ) { return w; }
		// Fallback: match by data-widget_type containing "video".
		var node = el.closest( '[data-widget_type]' );
		if ( node ) {
			var wt = node.getAttribute( 'data-widget_type' ) || '';
			if ( wt.split( '.' )[ 0 ] === TYPE ) { return node; }
		}
		return null;
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

	function ensureBtns( posterLabel ) {
		if ( ! vidBtn ) {
			vidBtn = makeBtn( 'Edit Video', 'video-alt3', function ( widget, ctx ) {
				openSrcPop( widget, ctx );
			} );
		}
		if ( ! posterBtn ) {
			posterBtn = makeBtn( 'Change Poster', 'format-image', doReplacePoster );
		}
		if ( posterLabel ) {
			posterBtn.innerHTML = '<span class="dashicons dashicons-format-image"></span> ' + posterLabel;
		}
	}

	function showBtns( widget, posterLabel ) {
		ensureBtns( posterLabel );
		clearTimeout( leaveTimer );
		btnWidget = widget;
		var r = widget.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideBtns(); return; }
		var offset = r.left + 8;
		vidBtn.style.top = ( r.top + 8 ) + 'px';
		vidBtn.style.left = offset + 'px';
		vidBtn.classList.add( 'is-visible' );
		offset += vidBtn.offsetWidth + 12;
		if ( posterLabel ) {
			posterBtn.style.top = ( r.top + 8 ) + 'px';
			posterBtn.style.left = offset + 'px';
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

	/* --- Hover detection (direct mouseover/mouseout) --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		var widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( widgetOf( e.target ) !== widget ) { return; }
			var hasVideo = findVideoField( res );
			if ( ! hasVideo ) { return; }
			var poster = findPosterField( res );
			showBtns( widget, poster ? poster.label : null );
		} );
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! btnWidget ) { return; }
		if ( e.relatedTarget && isOurBtn( e.relatedTarget ) ) { return; }
		leaveTimer = setTimeout( function () {
			if ( ( ! vidBtn || ! vidBtn.matches( ':hover' ) ) &&
			     ( ! posterBtn || ! posterBtn.matches( ':hover' ) ) ) {
				reallyHideBtn();
			}
		}, 100 );
	} );

	window.addEventListener( 'scroll', function () { reallyHideBtn(); }, true );
	window.addEventListener( 'resize', function () { reallyHideBtn(); } );

	var handler = {
		onClick: function ( event, widget, ctx ) {
			reallyHideBtn();
			openSrcPop( widget, ctx );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( TYPE, handler );

} )( window.RomanInline2 );
