/**
 * Roman Inline 2 — Classic gallery widget handler.
 *
 * Supports Elementor's image-gallery widget (and any widget using a
 * gallery control). Gallery images are stored in settings as an array
 * of { id, url } objects.
 *
 * Hover over the widget shows an "Add Image" button.
 * Hover over an individual gallery image shows "Replace" and "Delete" buttons.
 * All operations use the /gallery REST endpoint with action=add|replace|delete.
 *
 * Uses direct document-level mouseover/mouseout (like image.js handler).
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	var addBtn = null;
	var addBtnWidget = null;
	var imgBtns = [];
	var leaveTimer = null;
	var hoverMode = null;
	var SELECTOR = '.elementor-widget-image-gallery[data-id], .elementor-widget-image-carousel[data-id]';

	function findGalleryField( res ) {
		return ( res.fields || [] ).filter( function ( f ) {
			return 'gallery' === f.kind;
		} )[ 0 ];
	}

	function widgetOf( el ) {
		if ( ! el.closest ) { return null; }
		return el.closest( SELECTOR );
	}

	/* --- Add Image button (shown on widget hover) --- */
	function ensureAddBtn() {
		if ( addBtn ) { return; }
		addBtn = document.createElement( 'button' );
		addBtn.type = 'button';
		addBtn.className = 'ri2-gallery-add-btn ri2-ui';
		addBtn.innerHTML = '<span class="dashicons dashicons-plus-alt"></span> Add to Gallery';
		addBtn.title = 'Add to Gallery';
		addBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			clearTimeout( leaveTimer );
			if ( addBtnWidget ) {
				var widget = addBtnWidget;
				hideAddBtn();
				doAdd( widget, RI.ctx( widget ) );
			}
		} );
		addBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( addBtn );
	}

	function showAddBtn( widget ) {
		ensureAddBtn();
		clearTimeout( leaveTimer );
		addBtnWidget = widget;
		var r = widget.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideAddBtn(); return; }
		addBtn.style.top = ( r.bottom - 36 ) + 'px';
		addBtn.style.left = ( r.right - 140 ) + 'px';
		addBtn.classList.add( 'is-visible' );
	}

	function hideAddBtn() {
		if ( addBtn ) { addBtn.classList.remove( 'is-visible' ); }
	}

	/* --- Per-image buttons (Replace / Delete) --- */
	function ensureImgBtns() {
		if ( imgBtns.length ) { return; }
		var replace = document.createElement( 'button' );
		replace.type = 'button';
		replace.className = 'ri2-gallery-btn ri2-gallery-replace ri2-ui';
		replace.innerHTML = '<span class="dashicons dashicons-image-rotate"></span>';
		replace.title = 'Replace';

		var del = document.createElement( 'button' );
		del.type = 'button';
		del.className = 'ri2-gallery-btn ri2-gallery-delete ri2-ui';
		del.innerHTML = '<span class="dashicons dashicons-no"></span>';
		del.title = 'Delete';

		document.body.appendChild( replace );
		document.body.appendChild( del );
		imgBtns = [ replace, del ];
	}

	function showImgBtns( img, index, widget, ctx ) {
		ensureImgBtns();
		clearTimeout( leaveTimer );
		hoverMode = 'img';
		var r = img.getBoundingClientRect();
		if ( r.width < 20 || r.height < 20 ) { hideImgBtns(); return; }

		var replace = imgBtns[ 0 ];
		var del = imgBtns[ 1 ];

		replace.style.top = ( r.top + 4 ) + 'px';
		replace.style.left = ( r.left + 4 ) + 'px';
		replace.classList.add( 'is-visible' );
		replace.onclick = function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			hideImgBtns();
			doReplace( widget, ctx, index );
		};

		del.style.top = ( r.top + 36 ) + 'px';
		del.style.left = ( r.left + 4 ) + 'px';
		del.classList.add( 'is-visible' );
		del.onclick = function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			hideImgBtns();
			doDelete( widget, ctx, index );
		};
	}

	function hideImgBtns() {
		imgBtns.forEach( function ( b ) { b.classList.remove( 'is-visible' ); } );
	}

	function hideAll() {
		hoverMode = null;
		hideAddBtn();
		hideImgBtns();
		addBtnWidget = null;
	}

	/* --- Actions --- */
	function getGalleryField( ctx, cb ) {
		ctx.getFields().then( function ( res ) {
			var field = findGalleryField( res );
			if ( ! field ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}
			cb( field );
		} ).catch( function () {
			ctx.toast( ctx.i18n.saveFailed || 'Save failed', 'error' );
		} );
	}

	function doAdd( widget, ctx ) {
		ctx.openGalleryMedia( {
			onSelect: function ( attachments ) {
				getGalleryField( ctx, function ( field ) {
					ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
					var chain = Promise.resolve();
					attachments.forEach( function ( att ) {
						chain = chain.then( function () {
							return ctx.saveGallery( field.key, 'add', att.id );
						} );
					} );
					chain.then( function () { return ctx.refreshWidget(); } )
						.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
						.catch( function ( err ) {
							ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' );
						} );
				} );
			}
		} );
	}

	function doReplace( widget, ctx, index ) {
		ctx.openMedia( {
			onSelect: function ( attachment ) {
				getGalleryField( ctx, function ( field ) {
					ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
					ctx.saveGallery( field.key, 'replace', attachment.id, index )
						.then( function () { return ctx.refreshWidget(); } )
						.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
						.catch( function ( err ) {
							ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' );
						} );
				} );
			}
		} );
	}

	function doDelete( widget, ctx, index ) {
		getGalleryField( ctx, function ( field ) {
			ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
			ctx.saveGallery( field.key, 'delete', 0, index )
				.then( function () { return ctx.refreshWidget(); } )
				.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
				.catch( function ( err ) {
					ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' );
				} );
		} );
	}

	/* --- Image matching: find which gallery image was hovered --- */
	function getGalleryImages( widget ) {
		// WordPress [gallery] shortcode renders .gallery-item img
		var galleryImgs = widget.querySelectorAll( '.gallery-item img, .elementor-image-gallery img' );
		if ( galleryImgs.length ) { return galleryImgs; }
		// Carousel renders .swiper-slide-image
		return widget.querySelectorAll( '.swiper-slide-image' );
	}

	function indexOfImg( widget, img ) {
		var all = getGalleryImages( widget );
		for ( var i = 0; i < all.length; i++ ) {
			if ( all[ i ] === img ) { return i; }
		}
		return -1;
	}

	/* --- Hover detection --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }

		var widget = widgetOf( e.target );
		if ( ! widget ) { return; }

		// Check if hovering a gallery image
		var img = e.target.closest && e.target.closest( 'img' );
		if ( img && widget.contains( img ) ) {
			var allImgs = getGalleryImages( widget );
			if ( Array.prototype.indexOf.call( allImgs, img ) >= 0 ) {
				var idx = indexOfImg( widget, img );
				if ( idx >= 0 ) {
					var ctx = RI.ctx( widget );
					hoverMode = 'img';
					ctx.getFields().then( function ( res ) {
						if ( ! RI.isActive() || ! img.matches( ':hover' ) ) { return; }
						if ( findGalleryField( res ) ) {
							showImgBtns( img, idx, widget, ctx );
						}
					} ).catch( function () {} );
					return;
				}
			}
		}

		// Widget-level hover: show Add button
		if ( hoverMode === 'img' ) {
			// Mouse moved off an image but still inside widget — switch to add mode.
			hoverMode = null;
			hideImgBtns();
		}
		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( ! RI.isActive() || ! widget.matches( ':hover' ) ) { return; }
			if ( hoverMode === 'img' ) { return; }
			if ( findGalleryField( res ) ) {
				showAddBtn( widget );
			}
		} ).catch( function () {} );
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! addBtnWidget && ! imgBtns.some( function ( b ) { return b.classList.contains( 'is-visible' ); } ) ) { return; }

		var to = e.relatedTarget;
		if ( to && ( to === addBtn || ( addBtn && addBtn.contains( to ) ) ) ) { return; }
		if ( to && imgBtns.some( function ( b ) { return to === b || b.contains( to ); } ) ) { return; }
		if ( addBtnWidget && to && addBtnWidget.contains( to ) ) { return; }

		clearTimeout( leaveTimer );
		leaveTimer = setTimeout( function () {
			if ( addBtn && addBtn.matches( ':hover' ) ) { return; }
			if ( imgBtns.some( function ( b ) { return b.matches( ':hover' ); } ) ) { return; }
			hideAll();
		}, 100 );
	} );

	window.addEventListener( 'scroll', function () { hideAll(); }, true );
	window.addEventListener( 'resize', function () { hideAll(); } );

	var handler = {
		onClick: function () {},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'image-gallery', handler );
	RI.register( 'image-carousel', handler );

} )( window.RomanInline2 );
