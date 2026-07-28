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
	let plusBtns = [];      // [{ btn, slideIndex, slideEl, position }]
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
		const attr = slide.getAttribute( 'data-swiper-slide-index' );
		if ( null !== attr && '' !== attr ) {
			const n = parseInt( attr, 10 );
			if ( ! isNaN( n ) ) { return n; }
		}
		if ( slide.classList.contains( 'swiper-slide-duplicate' ) ) { return -1; }
		const realSlides = getRealSlides( widget );
		for ( let i = 0; i < realSlides.length; i++ ) {
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
		const all = widget.querySelectorAll( '.swiper-slide' );
		const real = [];
		for ( let i = 0; i < all.length; i++ ) {
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
		const all = widget.querySelectorAll( '.swiper-slide' );
		const match = [];
		for ( let i = 0; i < all.length; i++ ) {
			if ( slideIndexOf( all[ i ], widget ) === slideIndex ) {
				match.push( all[ i ] );
			}
		}
		return match;
	}

	function closeAnyPopover() {
		const lp = document.querySelector( '.ri2-linkpop' );
		if ( lp && lp.parentNode ) { lp.parentNode.removeChild( lp ); }
		const vp = document.querySelector( '.ri2-vidpop' );
		if ( vp && vp.parentNode ) { vp.parentNode.removeChild( vp ); }
	}

	function createToolbar( slideIndex, slideEl, field ) {
		const bar = document.createElement( 'div' );
		bar.className = 'ri2-actions ri2-ui';
		bar.dataset.slideIndex = slideIndex;

		const repItem = ( field.items || [] )[ slideIndex ];
		const slideType = ( repItem && repItem.type ) || 'image';

		// Change Image button (image-type only)
		if ( 'video' !== slideType ) {
			const imgBtn = document.createElement( 'button' );
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
			const vidBtn = document.createElement( 'button' );
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
		const linkBtn = document.createElement( 'button' );
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
		const delBtn = document.createElement( 'button' );
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
		const r = slideEl.getBoundingClientRect();
		const wr = widget.getBoundingClientRect();
		// For 3D transform effects (cube/coverflow), bounding rects can be
		// unreliable, so relax the size/position checks and rely on opacity/
		// visibility/display instead.
		const s = getSwiper( widget );
		const is3D = s && s.params && ( 'cube' === s.params.effect || 'coverflow' === s.params.effect );
		if ( is3D ) {
			if ( r.width < 1 || r.height < 1 ) { return false; }
		} else {
			if ( r.width < 24 || r.height < 24 ) { return false; }
			if ( ! ( r.right > wr.left + 4 && r.left < wr.right - 4 ) ) { return false; }
		}
		// Guard against overlapping-slide effects (fade/cube/coverflow) where an
		// inactive slide's box still geometrically intersects the widget but is
		// actually hidden via opacity/visibility/display.
		const cs = window.getComputedStyle( slideEl );
		if ( parseFloat( cs.opacity ) <= 0.05 ) { return false; }
		if ( 'hidden' === cs.visibility || 'none' === cs.display ) { return false; }
		return true;
	}

	function showToolbars( widget, field ) {
		clearAll();
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
		const el = document.elementFromPoint( mouseX, mouseY );
		if ( el ) {
			if ( widgetOf( el ) === widget ) { return true; }
			for ( let i = 0; i < toolbars.length; i++ ) {
				if ( toolbars[ i ].bar === el || toolbars[ i ].bar.contains( el ) ) { return true; }
			}
			for ( let pb = 0; pb < plusBtns.length; pb++ ) {
				if ( plusBtns[ pb ].btn === el || plusBtns[ pb ].btn.contains( el ) ) { return true; }
			}
		}
		// Fallback: geometric bounding-box check (covers e.g. mouseX/mouseY still
		// at their initial 0,0 default before any mousemove event has fired).
		const r = widget.getBoundingClientRect();
		if ( mouseX >= r.left && mouseX <= r.right && mouseY >= r.top && mouseY <= r.bottom ) {
			return true;
		}
		for ( let j = 0; j < toolbars.length; j++ ) {
			const br = toolbars[ j ].bar.getBoundingClientRect();
			if ( mouseX >= br.left && mouseX <= br.right && mouseY >= br.top && mouseY <= br.bottom ) {
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
		const allSlides = widget.querySelectorAll( '.swiper-slide' );
		const needed = []; // { slideEl, slideIndex }
		const seenSlides = [];

		for ( let j = 0; j < allSlides.length; j++ ) {
			const slide = allSlides[ j ];
			seenSlides.push( slide );
			if ( ! isSlideVisible( slide, widget ) ) { continue; }

			const slideIndex = slideIndexOf( slide, widget );
			if ( slideIndex < 0 ) { continue; }

			needed.push( { slideEl: slide, slideIndex: slideIndex } );
		}

		// Determine which slide the mouse is hovering over.
		let hoveredSlideEl = null;
		const elAtPoint = document.elementFromPoint( mouseX, mouseY );
		if ( elAtPoint ) {
			for ( let hi = 0; hi < seenSlides.length; hi++ ) {
				if ( seenSlides[ hi ] === elAtPoint || seenSlides[ hi ].contains( elAtPoint ) ) {
					hoveredSlideEl = seenSlides[ hi ];
					break;
				}
			}
			// Also keep toolbar if mouse is over the toolbar itself.
			if ( ! hoveredSlideEl ) {
				for ( let ti = 0; ti < toolbars.length; ti++ ) {
					if ( toolbars[ ti ].bar === elAtPoint || toolbars[ ti ].bar.contains( elAtPoint ) ) {
						hoveredSlideEl = toolbars[ ti ].slideEl;
						break;
					}
				}
			}
			// Also keep if mouse is over a plus button.
			if ( ! hoveredSlideEl ) {
				for ( let pi = 0; pi < plusBtns.length; pi++ ) {
					if ( plusBtns[ pi ].btn === elAtPoint || plusBtns[ pi ].btn.contains( elAtPoint ) ) {
						hoveredSlideEl = plusBtns[ pi ].slideEl;
						break;
					}
				}
			}
		}
		// Fallback for 3D effects (cube/coverflow): elementFromPoint may not
		// hit the slide due to 3D transforms. Use swiper's active slide instead.
		if ( ! hoveredSlideEl ) {
			const s = getSwiper( widget );
			if ( s && ( 'cube' === s.params.effect || 'coverflow' === s.params.effect ) ) {
				// Check if mouse is within the widget bounds.
				const wr = widget.getBoundingClientRect();
				if ( mouseX >= wr.left && mouseX <= wr.right && mouseY >= wr.top && mouseY <= wr.bottom ) {
					const activeIdx = s.activeIndex;
					if ( s.slides && s.slides[ activeIdx ] ) {
						hoveredSlideEl = s.slides[ activeIdx ];
					}
				}
			}
		}

		// Remove toolbars for slides no longer visible or not hovered.
		for ( let k = toolbars.length - 1; k >= 0; k-- ) {
			const stillVisible = toolbars[ k ].slideEl && isSlideVisible( toolbars[ k ].slideEl, widget ) && seenSlides.indexOf( toolbars[ k ].slideEl ) >= 0;
			const isHovered = toolbars[ k ].slideEl === hoveredSlideEl;
			if ( ! stillVisible || ! isHovered ) {
				if ( toolbars[ k ].bar.parentNode ) { toolbars[ k ].bar.parentNode.removeChild( toolbars[ k ].bar ); }
				toolbars.splice( k, 1 );
			}
		}

		// Remove plus buttons for slides no longer visible or not hovered.
		for ( let pk = plusBtns.length - 1; pk >= 0; pk-- ) {
			const pStillVisible = plusBtns[ pk ].slideEl && seenSlides.indexOf( plusBtns[ pk ].slideEl ) >= 0;
			const pIsHovered = plusBtns[ pk ].slideEl === hoveredSlideEl;
			if ( ! pStillVisible || ! pIsHovered ) {
				if ( plusBtns[ pk ].btn.parentNode ) { plusBtns[ pk ].btn.parentNode.removeChild( plusBtns[ pk ].btn ); }
				plusBtns.splice( pk, 1 );
			}
		}

		// Add toolbar and top plus button only for the hovered slide.
		if ( hoveredSlideEl ) {
			let hasToolbar = false;
			for ( let n = 0; n < toolbars.length; n++ ) {
				if ( toolbars[ n ].slideEl === hoveredSlideEl ) { hasToolbar = true; break; }
			}
			if ( ! hasToolbar ) {
				let hovIndex = -1;
				for ( let ni = 0; ni < needed.length; ni++ ) {
					if ( needed[ ni ].slideEl === hoveredSlideEl ) { hovIndex = needed[ ni ].slideIndex; break; }
				}
				if ( hovIndex >= 0 ) {
					const bar = createToolbar( hovIndex, hoveredSlideEl, field );
					document.body.appendChild( bar );
					toolbars.push( { bar: bar, slideIndex: hovIndex, slideEl: hoveredSlideEl } );
				}
			}

			// Plus buttons (insert before / after) for the hovered slide.
			const positions = [ 'left', 'right' ];
			for ( let posI = 0; posI < positions.length; posI++ ) {
				const pos = positions[ posI ];
				let hasPlus = false;
				for ( let pn = 0; pn < plusBtns.length; pn++ ) {
					if ( plusBtns[ pn ].slideEl === hoveredSlideEl && plusBtns[ pn ].position === pos ) { hasPlus = true; }
				}
				if ( ! hasPlus ) {
					let hovPlusIndex = -1;
					for ( let hpi = 0; hpi < needed.length; hpi++ ) {
						if ( needed[ hpi ].slideEl === hoveredSlideEl ) { hovPlusIndex = needed[ hpi ].slideIndex; break; }
					}
					if ( hovPlusIndex >= 0 ) {
						const plusBtn = createPlusBtn( hovPlusIndex, hoveredSlideEl, field, pos );
						document.body.appendChild( plusBtn );
						plusBtns.push( { btn: plusBtn, slideIndex: hovPlusIndex, slideEl: hoveredSlideEl, position: pos } );
					}
				}
			}
		}

		// Reposition all toolbars and plus buttons.
		for ( let p = 0; p < toolbars.length; p++ ) {
			positionToolbar( toolbars[ p ].bar, toolbars[ p ].slideEl, widget );
		}
		for ( let pp = 0; pp < plusBtns.length; pp++ ) {
			positionPlusBtn( plusBtns[ pp ].btn, plusBtns[ pp ].slideEl, plusBtns[ pp ].position, widget );
		}
	}

	function positionToolbar( bar, slideEl, widget ) {
		const carouselImg = slideEl.querySelector( '.elementor-carousel-image' );
		const target = carouselImg || slideEl;
		const r = target.getBoundingClientRect();
		const left = r.left + 6;
		const top = r.top + 6;
		bar.style.top = top + 'px';
		bar.style.left = left + 'px';

		// Toolbars are fixed-position on <body>, so they escape the swiper
		// container's overflow:hidden clipping. Hide any toolbar that would paint
		// outside the carousel viewport, otherwise a slide's toolbar stays visible
		// for a moment as that slide scrolls out of view.
		const clipEl = widget.querySelector( '.elementor-main-swiper' ) || widget;
		const cr = clipEl.getBoundingClientRect();
		const w = bar.offsetWidth || 0;
		const h = bar.offsetHeight || 0;
		const inside = left >= cr.left - 1 && ( left + w ) <= cr.right + 1 &&
			top >= cr.top - 1 && ( top + h ) <= cr.bottom + 1;
		bar.style.visibility = inside ? 'visible' : 'hidden';
	}

	function createPlusBtn( slideIndex, slideEl, field, position ) {
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'ri2-plus-btn ri2-ui';
		btn.innerHTML = '<span class="dashicons dashicons-plus-alt2"></span>';
		btn.title = ( 'left' === position )
			? ( RI.i18n.addSlideBefore || 'Add Slide Before' )
			: ( RI.i18n.addSlideAfter || 'Add Slide After' );
		btn.addEventListener( 'click', function ( e ) {
			e.preventDefault(); e.stopPropagation();
			closeAnyPopover();
			const insertIndex = ( 'left' === position ) ? slideIndex : slideIndex + 1;
			doAddSlide( insertIndex );
		} );
		btn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		return btn;
	}

	function positionPlusBtn( btn, slideEl, position, widget ) {
		const carouselImg = slideEl.querySelector( '.elementor-carousel-image' );
		const target = carouselImg || slideEl;
		const r = target.getBoundingClientRect();
		const btnW = btn.offsetWidth || 28;
		const btnH = btn.offsetHeight || 28;
		const top = r.top + ( r.height - btnH ) / 2;
		let left;

		if ( 'left' === position ) {
			left = r.left + 4;
		} else {
			left = r.right - btnW - 4;
		}

		btn.style.left = left + 'px';
		btn.style.top = top + 'px';
		btn.style.visibility = 'visible';
	}

	function clearToolbars() {
		for ( let i = 0; i < toolbars.length; i++ ) {
			if ( toolbars[ i ].bar && toolbars[ i ].bar.parentNode ) {
				toolbars[ i ].bar.parentNode.removeChild( toolbars[ i ].bar );
			}
		}
		toolbars = [];
	}

	function clearPlusBtns() {
		for ( let i = 0; i < plusBtns.length; i++ ) {
			if ( plusBtns[ i ].btn && plusBtns[ i ].btn.parentNode ) {
				plusBtns[ i ].btn.parentNode.removeChild( plusBtns[ i ].btn );
			}
		}
		plusBtns = [];
	}

	function clearAll() {
		clearToolbars();
		clearPlusBtns();
		stopRafLoop();
	}

	function hideAll() {
		clearAll();
		cachedField = null;
	}

	/* --- Action handlers --- */
	function getCtx( cb ) {
		if ( ! hoveredWidget ) { return; }
		const widget = hoveredWidget;
		const ctx = RI.ctx( widget );
		ctx.getFields().then( function ( res ) {
			const field = findRepeaterField( res );
			if ( ! field ) { return; }
			cb( ctx, widget, field );
		} );
	}

	function doChangeImage( slideIndex, slideEl ) {
		getCtx( function ( ctx, widget, field ) {
			clearAll();
			pauseSwiper( widget );
			ctx.openMedia( {
				onSelect: function ( attachment ) {
					ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
					const newUrl = attachment.url || ( attachment.sizes && attachment.sizes.full && attachment.sizes.full.url ) || '';
					if ( newUrl ) {
						// Patch the real slide *and* every loop-mode clone of it, otherwise
						// the stale clone shows the old image when the carousel wraps.
						let targets = slidesForIndex( widget, slideIndex );
						if ( ! targets.length ) { targets = [ slideEl ]; }
						targets.forEach( function ( el ) {
							const img = el.querySelector( '.elementor-carousel-image' );
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
		for ( let i = 0; i < toolbars.length; i++ ) {
			if ( toolbars[ i ].slideIndex === slideIndex ) {
				const bar = toolbars[ i ].bar;
				const r = bar.getBoundingClientRect();
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
		const toolbarEl = findToolbarForSlide( slideIndex );
		getCtx( function ( ctx, widget, field ) {
			clearAll();
			pauseSwiper( widget );
			const repItem = ( field.items || [] )[ slideIndex ];
			const currentUrl = ( repItem && repItem.video && repItem.video.url ) || '';
			const carouselImg = slideEl.querySelector( '.elementor-carousel-image' );
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
		const toolbarEl = findToolbarForSlide( slideIndex );
		getCtx( function ( ctx, widget, field ) {
			clearAll();
			pauseSwiper( widget );
			const repItem = ( field.items || [] )[ slideIndex ];
			const currentUrl = ( repItem && repItem.image_link_to && repItem.image_link_to.url ) || '';
			const currentBlank = !!( repItem && repItem.image_link_to && repItem.image_link_to.is_external );
			const carouselImg = slideEl.querySelector( '.elementor-carousel-image' );
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
			clearAll();
			ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
			ctx.deleteRepeaterItem( field.key, slideIndex )
				.then( function () { return ctx.refreshWidget(); } )
				.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
				.catch( function ( err ) { ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' ); } );
		} );
	}

	function doAddSlide( insertIndex ) {
		if ( ! hoveredWidget ) { return; }
		const widget = hoveredWidget;
		const ctx = RI.ctx( widget );
		hideAll();
		ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
		ctx.getFields().then( function ( res ) {
			const field = findRepeaterField( res );
			if ( ! field ) { return; }
			ctx.addRepeaterItem( field.key, 'media-carousel', insertIndex )
				.then( function () { return ctx.refreshWidget(); } )
				.then( function ( newWidget ) {
					ctx.toast( ctx.i18n.saved || 'Saved', 'ok' );
					// Navigate swiper to the newly inserted slide after re-init.
					// refreshWidget replaces the widget DOM, so use the returned element.
					const target = newWidget || widget;
					setTimeout( function () {
						const s = getSwiper( target );
						if ( s ) {
							if ( s.params.loop ) {
								s.slideToLoop( insertIndex );
							} else {
								s.slideTo( insertIndex );
							}
						}
						// Fallback: scroll the new slide into view.
						const realSlides = getRealSlides( target );
						if ( realSlides[ insertIndex ] ) {
							realSlides[ insertIndex ].scrollIntoView( { behavior: 'smooth', block: 'nearest', inline: 'center' } );
						}
					}, 300 );
				} )
				.catch( function ( err ) { ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' ); } );
		} );
	}

	/* --- Hover: show per-slide toolbars + plus buttons --- */
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
			const field = findRepeaterField( res );
			if ( field ) {
				showToolbars( widgetRef, field );
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
