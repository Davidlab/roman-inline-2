/**
 * Roman Inline 2 — Pro media-carousel widget handler.
 *
 * Repeater control 'slides' with sub-fields:
 *   - type           (image|video)
 *   - image          (MEDIA)     → "Change Image" button on hover
 *   - video          (URL)       → video URL popover
 *   - image_link_to  (URL)       → link popover
 *
 * Per-slide toolbar (on each visible slide):
 *   - Change Image (image-type slides)
 *   - Change Video (video-type slides)
 *   - Edit Link
 *   - Delete Slide
 *
 * Carousel-level floating button:
 *   - Add Slide (top-right of the carousel widget)
 *
 * Markup: .swiper-slide, .elementor-carousel-image.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const SELECTOR = '.elementor-widget-media-carousel[data-id]';

	let toolbars = [];      // [{ bar, slideIndex, slideEl }]
	let addBtn = null;
	let hoveredWidget = null;
	let cachedField = null;
	let rafId = null;
	let mouseX = 0, mouseY = 0;

	// Track mouse position globally so the rAF loop can detect when the mouse leaves.
	document.addEventListener( 'mousemove', function ( e ) {
		mouseX = e.clientX;
		mouseY = e.clientY;
	}, true );

	function widgetOf( el ) {
		if ( ! el.closest ) { return null; }
		return el.closest( SELECTOR );
	}

	function findRepeaterField( res ) {
		return ( res.fields || [] ).filter( function ( f ) { return 'repeater' === f.kind; } )[ 0 ];
	}

	/**
	 * Resolve a slide element to its index in the repeater.
	 *
	 * Media-carousel slides carry no `elementor-repeater-item-*` class, so we use
	 * Swiper's own `data-swiper-slide-index`. Swiper stamps this on the real
	 * slides *before* cloning them for loop mode, so the duplicate clones inherit
	 * the correct index too — which is what makes toolbars work on looped slides.
	 *
	 * Falls back to DOM position among real slides when loop mode is off (in which
	 * case Swiper never runs loopCreate and the attribute is absent).
	 */
	function slideIndexOf( slide, widget ) {
		var attr = slide.getAttribute( 'data-swiper-slide-index' );
		if ( null !== attr && '' !== attr ) {
			var n = parseInt( attr, 10 );
			if ( ! isNaN( n ) ) { return n; }
		}
		if ( slide.classList.contains( 'swiper-slide-duplicate' ) ) { return -1; }
		var realSlides = getRealSlides( widget );
		for ( var i = 0; i < realSlides.length; i++ ) {
			if ( realSlides[ i ] === slide ) { return i; }
		}
		return -1;
	}

	/* --- Swiper helpers --- */
	function getSwiper( widget ) {
		const wrapper = widget.querySelector( '.elementor-main-swiper' );
		if ( ! wrapper ) { return null; }
		if ( window.jQuery ) {
			const s = window.jQuery( wrapper ).data( 'swiper' );
			if ( s ) { return s; }
		}
		return wrapper.swiper || null;
	}

	function pauseSwiper( widget ) {
		const s = getSwiper( widget );
		if ( s && s.autoplay ) { s.autoplay.stop(); }
	}

	function resumeSwiper( widget ) {
		const s = getSwiper( widget );
		if ( s && s.autoplay ) { s.autoplay.start(); }
	}

	/* --- Per-slide action toolbars (appended inside each slide) --- */
	function getRealSlides( widget ) {
		var all = widget.querySelectorAll( '.swiper-slide' );
		var real = [];
		for ( var i = 0; i < all.length; i++ ) {
			if ( ! all[ i ].classList.contains( 'swiper-slide-duplicate' ) ) {
				real.push( all[ i ] );
			}
		}
		return real;
	}

	/**
	 * All slide elements that render a given repeater index — the real slide plus
	 * any loop-mode clones. Clones inherit `data-swiper-slide-index`, so an
	 * optimistic DOM update must touch every one of them or the stale clone
	 * reappears as soon as the carousel wraps around.
	 */
	function slidesForIndex( widget, slideIndex ) {
		var all = widget.querySelectorAll( '.swiper-slide' );
		var match = [];
		for ( var i = 0; i < all.length; i++ ) {
			if ( slideIndexOf( all[ i ], widget ) === slideIndex ) {
				match.push( all[ i ] );
			}
		}
		return match;
	}

	function closeAnyPopover() {
		var lp = document.querySelector( '.ri2-linkpop' );
		if ( lp && lp.parentNode ) { lp.parentNode.removeChild( lp ); }
		var vp = document.querySelector( '.ri2-vidpop' );
		if ( vp && vp.parentNode ) { vp.parentNode.removeChild( vp ); }
	}

	function createToolbar( slideIndex, slideEl, field ) {
		var bar = document.createElement( 'div' );
		bar.className = 'ri2-actions ri2-ui';
		bar.dataset.slideIndex = slideIndex;

		var repItem = ( field.items || [] )[ slideIndex ];
		var slideType = ( repItem && repItem.type ) || 'image';

		// Change Image button (image-type only)
		if ( 'video' !== slideType ) {
			var imgBtn = document.createElement( 'button' );
			imgBtn.type = 'button';
			imgBtn.className = 'ri2-actbtn ri2-actbtn--image';
			imgBtn.innerHTML = '<span class="dashicons dashicons-format-image"></span>';
			imgBtn.title = RI.i18n.changeImage || 'Change Image';
			imgBtn.addEventListener( 'click', function ( e ) {
				e.preventDefault(); e.stopPropagation();
				closeAnyPopover();
				doChangeImage( slideIndex, slideEl );
			} );
			imgBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
			bar.appendChild( imgBtn );
		}

		// Change Video button (video-type only)
		if ( 'video' === slideType ) {
			var vidBtn = document.createElement( 'button' );
			vidBtn.type = 'button';
			vidBtn.className = 'ri2-actbtn ri2-actbtn--video';
			vidBtn.innerHTML = '<span class="dashicons dashicons-video-alt3"></span>';
			vidBtn.title = RI.i18n.changeVideo || 'Change Video';
			vidBtn.addEventListener( 'click', function ( e ) {
				e.preventDefault(); e.stopPropagation();
				if ( document.querySelector( '.ri2-vidpop' ) ) {
					closeAnyPopover();
					return;
				}
				closeAnyPopover();
				doChangeVideo( slideIndex, slideEl );
			} );
			vidBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
			bar.appendChild( vidBtn );
		}

		// Edit Link button
		var linkBtn = document.createElement( 'button' );
		linkBtn.type = 'button';
		linkBtn.className = 'ri2-actbtn ri2-actbtn--link';
		linkBtn.innerHTML = '<span class="dashicons dashicons-admin-links"></span>';
		linkBtn.title = RI.i18n.link || 'Link';
		linkBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault(); e.stopPropagation();
			if ( document.querySelector( '.ri2-linkpop' ) ) {
				closeAnyPopover();
				return;
			}
			closeAnyPopover();
			doEditLink( slideIndex, slideEl );
		} );
		linkBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		bar.appendChild( linkBtn );

		// Delete Slide button
		var delBtn = document.createElement( 'button' );
		delBtn.type = 'button';
		delBtn.className = 'ri2-actbtn ri2-actbtn--delete';
		delBtn.innerHTML = '<span class="dashicons dashicons-trash"></span>';
		delBtn.title = RI.i18n.deleteSlide || 'Delete Slide';
		delBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault(); e.stopPropagation();
			closeAnyPopover();
			doDeleteSlide( slideIndex );
		} );
		delBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		bar.appendChild( delBtn );

		return bar;
	}

	function isSlideVisible( slideEl, widget ) {
		var r = slideEl.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { return false; }
		var wr = widget.getBoundingClientRect();
		if ( ! ( r.right > wr.left + 4 && r.left < wr.right - 4 ) ) { return false; }
		// Guard against overlapping-slide effects (fade/cube/coverflow) where an
		// inactive slide's box still geometrically intersects the widget but is
		// actually hidden via opacity/visibility/display.
		var cs = window.getComputedStyle( slideEl );
		if ( parseFloat( cs.opacity ) <= 0.05 ) { return false; }
		if ( 'hidden' === cs.visibility || 'none' === cs.display ) { return false; }
		return true;
	}

	function showToolbars( widget, field ) {
		clearToolbars();
		cachedField = field;
		startRafLoop( widget );
	}

	/* --- requestAnimationFrame loop: sync toolbars to visible slides at 60fps --- */
	function mouseInWidget( widget ) {
		// Primary check: what DOM element is actually under the cursor right now?
		// This correctly handles controls positioned outside the widget's own
		// layout box (e.g. Elementor's "outside" nav-arrow position setting),
		// where a pure geometric bounding-box check would falsely report that
		// the mouse has "left" the widget the moment it reaches such a control.
		var el = document.elementFromPoint( mouseX, mouseY );
		if ( el ) {
			if ( widgetOf( el ) === widget ) { return true; }
			for ( var i = 0; i < toolbars.length; i++ ) {
				if ( toolbars[ i ].bar === el || toolbars[ i ].bar.contains( el ) ) { return true; }
			}
			if ( addBtn && ( addBtn === el || addBtn.contains( el ) ) ) { return true; }
		}
		// Fallback: geometric bounding-box check (covers e.g. mouseX/mouseY still
		// at their initial 0,0 default before any mousemove event has fired).
		var r = widget.getBoundingClientRect();
		if ( mouseX >= r.left && mouseX <= r.right && mouseY >= r.top && mouseY <= r.bottom ) {
			return true;
		}
		for ( var j = 0; j < toolbars.length; j++ ) {
			var br = toolbars[ j ].bar.getBoundingClientRect();
			if ( mouseX >= br.left && mouseX <= br.right && mouseY >= br.top && mouseY <= br.bottom ) {
				return true;
			}
		}
		if ( addBtn ) {
			var ar = addBtn.getBoundingClientRect();
			if ( mouseX >= ar.left && mouseX <= ar.right && mouseY >= ar.top && mouseY <= ar.bottom ) {
				return true;
			}
		}
		return false;
	}

	function startRafLoop( widget ) {
		stopRafLoop();
		function tick() {
			if ( ! hoveredWidget || hoveredWidget !== widget || ! cachedField ) {
				stopRafLoop();
				return;
			}
			try {
				// Don't hide during an active editing session.
				if ( RI.hasSession && RI.hasSession() ) {
					rafId = requestAnimationFrame( tick );
					return;
				}
				// Check if mouse is still within the widget bounds.
				if ( ! mouseInWidget( widget ) ) {
					// Mouse left — hide everything.
					hideAll();
					resumeSwiper( widget );
					hoveredWidget = null;
					return;
				}
				syncToolbars( widget, cachedField );
			} catch ( err ) {
				// Never let a single-frame error silently kill the loop.
				console.error( 'RI2 media-carousel rAF tick error:', err );
			}
			rafId = requestAnimationFrame( tick );
		}
		rafId = requestAnimationFrame( tick );
	}

	function stopRafLoop() {
		if ( rafId ) {
			cancelAnimationFrame( rafId );
			rafId = null;
		}
	}

	function syncToolbars( widget, field ) {
		// Determine which visible slides need toolbars. Duplicate slides created by
		// loop mode are included — they are what's on screen once the loop wraps.
		var allSlides = widget.querySelectorAll( '.swiper-slide' );
		var needed = []; // { slideEl, slideIndex }
		var seenSlides = [];

		for ( var j = 0; j < allSlides.length; j++ ) {
			var slide = allSlides[ j ];
			seenSlides.push( slide );
			if ( ! isSlideVisible( slide, widget ) ) { continue; }

			var slideIndex = slideIndexOf( slide, widget );
			if ( slideIndex < 0 ) { continue; }

			needed.push( { slideEl: slide, slideIndex: slideIndex } );
		}

		// Remove toolbars whose slide is gone or no longer visible.
		for ( var k = toolbars.length - 1; k >= 0; k-- ) {
			var t = toolbars[ k ];
			var stillVisible = t.slideEl && isSlideVisible( t.slideEl, widget ) && seenSlides.indexOf( t.slideEl ) >= 0;
			if ( ! stillVisible ) {
				if ( t.bar.parentNode ) { t.bar.parentNode.removeChild( t.bar ); }
				toolbars.splice( k, 1 );
			}
		}

		// Add toolbars for visible slides that don't have one yet.
		for ( var m = 0; m < needed.length; m++ ) {
			var hasToolbar = false;
			for ( var n = 0; n < toolbars.length; n++ ) {
				if ( toolbars[ n ].slideEl === needed[ m ].slideEl ) {
					hasToolbar = true;
					break;
				}
			}
			if ( hasToolbar ) { continue; }

			var bar = createToolbar( needed[ m ].slideIndex, needed[ m ].slideEl, field );
			document.body.appendChild( bar );
			toolbars.push( { bar: bar, slideIndex: needed[ m ].slideIndex, slideEl: needed[ m ].slideEl } );
		}

		// Reposition all toolbars to match their slides.
		for ( var p = 0; p < toolbars.length; p++ ) {
			positionToolbar( toolbars[ p ].bar, toolbars[ p ].slideEl, widget );
		}
	}

	function positionToolbar( bar, slideEl, widget ) {
		var carouselImg = slideEl.querySelector( '.elementor-carousel-image' );
		var target = carouselImg || slideEl;
		var r = target.getBoundingClientRect();
		var left = r.left + 6;
		var top = r.top + 6;
		bar.style.top = top + 'px';
		bar.style.left = left + 'px';

		// Toolbars are fixed-position on <body>, so they escape the swiper
		// container's overflow:hidden clipping. Hide any toolbar that would paint
		// outside the carousel viewport, otherwise a slide's toolbar stays visible
		// for a moment as that slide scrolls out of view.
		var clipEl = widget.querySelector( '.elementor-main-swiper' ) || widget;
		var cr = clipEl.getBoundingClientRect();
		var w = bar.offsetWidth || 0;
		var h = bar.offsetHeight || 0;
		var inside = left >= cr.left - 1 && ( left + w ) <= cr.right + 1 &&
			top >= cr.top - 1 && ( top + h ) <= cr.bottom + 1;
		bar.style.visibility = inside ? 'visible' : 'hidden';
	}

	function clearToolbars() {
		stopRafLoop();
		for ( var i = 0; i < toolbars.length; i++ ) {
			if ( toolbars[ i ].bar && toolbars[ i ].bar.parentNode ) {
				toolbars[ i ].bar.parentNode.removeChild( toolbars[ i ].bar );
			}
		}
		toolbars = [];
	}

	/* --- Separate "Add Slide" button for the carousel widget --- */
	function ensureAddBtn() {
		if ( addBtn ) { return; }
		addBtn = document.createElement( 'button' );
		addBtn.type = 'button';
		addBtn.className = 'ri2-carousel-addbtn ri2-ui';
		addBtn.innerHTML = '<span class="dashicons dashicons-plus-alt"></span> ' + ( RI.i18n.addSlide || 'Add Slide' );
		addBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault(); e.stopPropagation();
			doAddSlide();
		} );
		addBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( addBtn );
	}

	function showAddBtn( widget ) {
		ensureAddBtn();
		var clipEl = widget.querySelector( '.elementor-main-swiper' ) || widget;
		var r = clipEl.getBoundingClientRect();
		if ( r.width < 24 ) { hideAddBtn(); return; }
		addBtn.classList.add( 'is-visible' );
		addBtn.style.top = r.top + 'px';
		addBtn.style.left = ( r.right - addBtn.offsetWidth ) + 'px';
	}

	function hideAddBtn() {
		if ( addBtn ) { addBtn.classList.remove( 'is-visible' ); }
	}

	function hideAll() {
		clearToolbars();
		cachedField = null;
		hideAddBtn();
	}

	/* --- Action handlers --- */
	function getCtx( cb ) {
		if ( ! hoveredWidget ) { return; }
		var widget = hoveredWidget;
		var ctx = RI.ctx( widget );
		ctx.getFields().then( function ( res ) {
			var field = findRepeaterField( res );
			if ( ! field ) { return; }
			cb( ctx, widget, field );
		} );
	}

	function doChangeImage( slideIndex, slideEl ) {
		getCtx( function ( ctx, widget, field ) {
			clearToolbars();
			pauseSwiper( widget );
			ctx.openMedia( {
				onSelect: function ( attachment ) {
					ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
					var newUrl = attachment.url || ( attachment.sizes && attachment.sizes.full && attachment.sizes.full.url ) || '';
					if ( newUrl ) {
						// Patch the real slide *and* every loop-mode clone of it, otherwise
						// the stale clone shows the old image when the carousel wraps.
						var targets = slidesForIndex( widget, slideIndex );
						if ( ! targets.length ) { targets = [ slideEl ]; }
						targets.forEach( function ( el ) {
							var img = el.querySelector( '.elementor-carousel-image' );
							if ( ! img ) { return; }
							img.style.setProperty( 'background-image', "url('" + newUrl + "')", 'important' );
							// Swiper's lazy module re-applies data-background when the slide
							// scrolls into view, so it has to point at the new image too.
							if ( img.hasAttribute( 'data-background' ) ) {
								img.setAttribute( 'data-background', newUrl );
							}
						} );
					}
					ctx.saveRepeaterItem( field.key, slideIndex, 'image', attachment.id )
						.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
						.catch( function ( err ) { ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' ); } );
				}
			} );
		} );
	}

	function findToolbarForSlide( slideIndex ) {
		for ( var i = 0; i < toolbars.length; i++ ) {
			if ( toolbars[ i ].slideIndex === slideIndex ) {
				var bar = toolbars[ i ].bar;
				var r = bar.getBoundingClientRect();
				// Return a fake node whose getBoundingClientRect returns the
				// rect captured *before* clearToolbars() removes the bar from DOM.
				return {
					getBoundingClientRect: function () { return r; },
					querySelector: function () { return null; },
					tagName: 'DIV'
				};
			}
		}
		return null;
	}

	function doChangeVideo( slideIndex, slideEl ) {
		var toolbarEl = findToolbarForSlide( slideIndex );
		getCtx( function ( ctx, widget, field ) {
			clearToolbars();
			pauseSwiper( widget );
			var repItem = ( field.items || [] )[ slideIndex ];
			var currentUrl = ( repItem && repItem.video && repItem.video.url ) || '';
			var carouselImg = slideEl.querySelector( '.elementor-carousel-image' );
			ctx.editLink( toolbarEl || carouselImg || slideEl, {
				key: field.key,
				itemIndex: slideIndex,
				subField: 'video',
				linkKey: 'video',
				url: currentUrl,
				targetBlank: false
			} );
		} );
	}

	function doEditLink( slideIndex, slideEl ) {
		var toolbarEl = findToolbarForSlide( slideIndex );
		getCtx( function ( ctx, widget, field ) {
			clearToolbars();
			pauseSwiper( widget );
			var repItem = ( field.items || [] )[ slideIndex ];
			var currentUrl = ( repItem && repItem.image_link_to && repItem.image_link_to.url ) || '';
			var currentBlank = !!( repItem && repItem.image_link_to && repItem.image_link_to.is_external );
			var carouselImg = slideEl.querySelector( '.elementor-carousel-image' );
			ctx.editLink( toolbarEl || carouselImg || slideEl, {
				key: field.key,
				itemIndex: slideIndex,
				subField: 'image_link_to',
				linkKey: 'image_link_to',
				url: currentUrl,
				targetBlank: currentBlank
			} );
		} );
	}

	function doDeleteSlide( slideIndex ) {
		getCtx( function ( ctx, widget, field ) {
			clearToolbars();
			ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
			ctx.deleteRepeaterItem( field.key, slideIndex )
				.then( function () { return ctx.refreshWidget(); } )
				.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
				.catch( function ( err ) { ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' ); } );
		} );
	}

	function doAddSlide() {
		if ( ! hoveredWidget ) { return; }
		var widget = hoveredWidget;
		var ctx = RI.ctx( widget );
		hideAll();
		ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
		ctx.getFields().then( function ( res ) {
			var field = findRepeaterField( res );
			if ( ! field ) { return; }
			ctx.addRepeaterItem( field.key, 'media-carousel' )
				.then( function () { return ctx.refreshWidget(); } )
				.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
				.catch( function ( err ) { ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' ); } );
		} );
	}

	/* --- Hover: show per-slide toolbars + carousel-level Add Slide button --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		if ( hoveredWidget !== widget ) {
			hoveredWidget = widget;
			pauseSwiper( widget );
		}
		// Already showing toolbars for this widget? rAF loop handles updates.
		if ( rafId && cachedField && hoveredWidget === widget ) { return; }
		// Save widget ref — e.target may be detached by swiper before promise resolves.
		const widgetRef = widget;
		RI.ctx( widgetRef ).getFields().then( function ( res ) {
			if ( ! RI.isActive() ) { return; }
			if ( hoveredWidget !== widgetRef ) { return; }
			var field = findRepeaterField( res );
			if ( field ) {
				showToolbars( widgetRef, field );
				showAddBtn( widgetRef );
			}
		} ).catch( function () {} );
	} );


	window.addEventListener( 'scroll', function () { hideAll(); }, true );
	window.addEventListener( 'resize', function () { hideAll(); } );

	// Resume autoplay when clicking next/prev navigation buttons
	document.addEventListener( 'click', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! e.target.closest ) { return; }
		const navBtn = e.target.closest( '.elementor-swiper-button' );
		if ( ! navBtn ) { return; }
		const widget = widgetOf( navBtn );
		if ( ! widget ) { return; }
		setTimeout( function () { resumeSwiper( widget ); }, 50 );
	}, false );

	/* --- Safety net: prevent navigation on slide <a> tags --- */
	document.addEventListener( 'click', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		const anchor = e.target.closest && e.target.closest( 'a' );
		if ( anchor && widget.contains( anchor ) ) {
			e.preventDefault();
		}
	}, true );

	/* --- Handler --- */
	const handler = {
		onClick: function () {},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'media-carousel', handler );

} )( window.RomanInline2 );
