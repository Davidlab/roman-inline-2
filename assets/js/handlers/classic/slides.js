/**
 * Roman Inline 2 — Classic slides widget handler (Elementor Pro).
 *
 * Supports the Elementor Pro Slides widget which uses a repeater
 * control named 'slides' with per-slide fields:
 *   - heading       (TEXT)      → inline edit on click
 *   - description   (TEXTAREA)  → inline edit on click
 *   - link          (URL)       → link popover on click
 *   - background_image (MEDIA)  → "Change Image" button on hover
 *
 * The slides widget renders swiper slides. Only the active (visible)
 * slide is editable at any time.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	var SELECTOR = '.elementor-widget-slides[data-id]';
	var imgBtn = null;
	var hoveredBg = null;
	var hoveredWidget = null;
	var leaveTimer = null;

	function widgetOf( el ) {
		if ( ! el.closest ) { return null; }
		return el.closest( SELECTOR );
	}

	function findSlidesField( res ) {
		return ( res.fields || [] ).filter( function ( f ) { return 'slides' === f.kind; } )[ 0 ];
	}

	function getSlides( widget ) {
		return widget.querySelectorAll( '.swiper-slide' );
	}

	function repeaterId( slide ) {
		var cls = slide.className || '';
		var m = cls.match( /elementor-repeater-item-([a-f0-9]+)/ );
		return m ? m[ 1 ] : null;
	}

	function getActiveSlide( widget ) {
		var allSlides = getSlides( widget );
		var activeEl = null;
		for ( var i = 0; i < allSlides.length; i++ ) {
			if ( allSlides[ i ].classList.contains( 'swiper-slide-active' ) ) {
				activeEl = allSlides[ i ];
				break;
			}
		}
		if ( ! activeEl ) {
			if ( allSlides.length === 1 ) {
				return { el: allSlides[ 0 ], index: 0 };
			}
			return null;
		}
		var repId = repeaterId( activeEl );
		var realSlides = [];
		for ( var j = 0; j < allSlides.length; j++ ) {
			if ( ! allSlides[ j ].classList.contains( 'swiper-slide-duplicate' ) ) {
				realSlides.push( allSlides[ j ] );
			}
		}
		if ( repId ) {
			for ( var k = 0; k < realSlides.length; k++ ) {
				if ( repeaterId( realSlides[ k ] ) === repId ) {
					return { el: activeEl, index: k };
				}
			}
		}
		for ( var m = 0; m < realSlides.length; m++ ) {
			if ( realSlides[ m ] === activeEl ) {
				return { el: activeEl, index: m };
			}
		}
		return { el: activeEl, index: 0 };
	}

	/* --- Swiper helpers --- */
	function getSwiper( widget ) {
		var wrapper = widget.querySelector( '.elementor-slides-wrapper' );
		if ( ! wrapper ) { return null; }
		if ( window.jQuery ) {
			var s = window.jQuery( wrapper ).data( 'swiper' );
			if ( s ) { return s; }
		}
		return wrapper.swiper || null;
	}

	function pauseSwiper( widget ) {
		var s = getSwiper( widget );
		if ( s && s.autoplay ) { s.autoplay.stop(); }
	}

	function resumeSwiper( widget ) {
		var s = getSwiper( widget );
		if ( s && s.autoplay ) { s.autoplay.start(); }
	}

	/* --- Change Image button --- */
	function ensureImgBtn() {
		if ( imgBtn ) { return; }
		imgBtn = document.createElement( 'button' );
		imgBtn.type = 'button';
		imgBtn.className = 'ri2-imgbtn ri2-ui';
		imgBtn.innerHTML = '<span class="dashicons dashicons-format-image"></span> Change Image';
		imgBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			if ( ! hoveredBg ) { return; }
			var widget = widgetOf( hoveredBg );
			pauseSwiper( widget );
			var active = getActiveSlide( widget );
			if ( ! active ) { return; }
			var slideEl = active.el;
			var slideIndex = active.index;
			var repId = repeaterId( slideEl );
			var ctx = RI.ctx( widget );
			ctx.getFields().then( function ( res ) {
				var field = findSlidesField( res );
				if ( ! field ) { return; }
				ctx.openMedia( {
					onSelect: function ( attachment ) {
						ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
						var newUrl = attachment.url || ( attachment.sizes && attachment.sizes.full && attachment.sizes.full.url ) || '';

						// Optimistic: update all slide bg elements with matching repeater ID
						function applyBg( el ) {
							if ( el && newUrl ) {
								el.style.setProperty( 'transition', 'none', 'important' );
								el.style.setProperty( 'background-image', "url('" + newUrl + "')", 'important' );
							}
						}
						if ( repId ) {
							var all = widget.querySelectorAll( '.swiper-slide' );
							for ( var i = 0; i < all.length; i++ ) {
								if ( repeaterId( all[ i ] ) === repId ) {
									applyBg( all[ i ].querySelector( '.swiper-slide-bg' ) );
								}
							}
						} else {
							applyBg( slideEl.querySelector( '.swiper-slide-bg' ) );
						}

						ctx.saveSlides( field.key, slideIndex, 'background_image', attachment.id )
							.then( function () {
								ctx.toast( ctx.i18n.saved || 'Saved', 'ok' );
							} )
							.catch( function ( err ) {
								ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' );
							} );
					}
				} );
			} );
		} );
		imgBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( imgBtn );
	}

	function showImgBtn( bgEl ) {
		ensureImgBtn();
		hoveredBg = bgEl;
		var r = bgEl.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideImgBtn(); return; }
		imgBtn.style.top = ( r.top + 8 ) + 'px';
		imgBtn.style.left = ( r.left + 8 ) + 'px';
		imgBtn.classList.add( 'is-visible' );
	}

	function hideImgBtn() {
		if ( imgBtn ) { imgBtn.classList.remove( 'is-visible' ); }
		hoveredBg = null;
	}

	/* --- Click handler for inline text/link editing --- */
	function handleClick( e, widget, ctx ) {
		var active = getActiveSlide( widget );
		if ( ! active ) { return; }
		var slideEl = active.el;

		var heading = slideEl.querySelector( '.elementor-slide-heading' );
		if ( heading && ( e.target === heading || heading.contains( e.target ) ) ) {
			e.preventDefault();
			e.stopPropagation();
			pauseSwiper( widget );
			ctx.getFields().then( function ( res ) {
				var field = findSlidesField( res );
				if ( ! field ) { return; }
				ctx.editText( heading, {
					key:        field.key,
					kind:       'text',
					slideIndex: active.index,
					subField:   'heading'
				} );
			} );
			return;
		}

		var desc = slideEl.querySelector( '.elementor-slide-description' );
		if ( desc && ( e.target === desc || desc.contains( e.target ) ) ) {
			e.preventDefault();
			e.stopPropagation();
			pauseSwiper( widget );
			ctx.getFields().then( function ( res ) {
				var field = findSlidesField( res );
				if ( ! field ) { return; }
				ctx.editText( desc, {
					key:        field.key,
					kind:       'text',
					slideIndex: active.index,
					subField:   'description'
				} );
			} );
			return;
		}

		var btn = slideEl.querySelector( '.elementor-slide-button' );
		if ( btn && ( e.target === btn || btn.contains( e.target ) ) ) {
			e.preventDefault();
			e.stopPropagation();
			pauseSwiper( widget );
			ctx.getFields().then( function ( res ) {
				var field = findSlidesField( res );
				if ( ! field ) { return; }
				ctx.editLink( btn, {
					key:        field.key,
					slideIndex: active.index,
					subField:   'link'
				} );
			} );
			return;
		}

		// link_click=slide: the entire swiper-slide-inner is an <a>
		var inner = slideEl.querySelector( '.swiper-slide-inner' );
		if ( inner && inner.tagName === 'A' && ( e.target === inner || inner.contains( e.target ) ) ) {
			// Don't intercept heading/description clicks (those are text edits)
			if ( heading && ( e.target === heading || heading.contains( e.target ) ) ) { return; }
			if ( desc && ( e.target === desc || desc.contains( e.target ) ) ) { return; }
			e.preventDefault();
			e.stopPropagation();
			pauseSwiper( widget );
			ctx.getFields().then( function ( res ) {
				var field = findSlidesField( res );
				if ( ! field ) { return; }
				ctx.editLink( inner, {
					key:        field.key,
					slideIndex: active.index,
					subField:   'link'
				} );
			} );
			return;
		}
	}

	/* --- Safety net: prevent navigation on slide <a> tags in capture phase --- */
	// Core.js also does this, but we add an extra safety net here.
	document.addEventListener( 'click', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		var widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		// If inside a slide <a> tag, prevent navigation — handleClick will open editLink
		var anchor = e.target.closest && e.target.closest( 'a' );
		if ( anchor && widget.contains( anchor ) ) {
			e.preventDefault();
		}
	}, true );

	/* --- Hover: show Change Image button + pause Swiper --- */
	// Uses the same pattern as image.js: document-level mouseover/mouseout
	// with a setTimeout + :hover check. onLeave is a no-op so core.js's
	// own mouseout timer doesn't interfere.
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		var widget = widgetOf( e.target );
		if ( ! widget ) { return; }

		// Pause swiper when entering the widget
		if ( hoveredWidget !== widget ) {
			hoveredWidget = widget;
			pauseSwiper( widget );
		}

		// Show the Change Image button on the active slide
		var active = getActiveSlide( widget );
		if ( active ) {
			var bg = active.el.querySelector( '.swiper-slide-bg' );
			if ( bg ) {
				clearTimeout( leaveTimer );
				showImgBtn( bg );
			}
		}
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! hoveredBg ) { return; }

		// If moving to the imgBtn or one of its children, keep button visible
		if ( e.relatedTarget && imgBtn && ( e.relatedTarget === imgBtn || imgBtn.contains( e.relatedTarget ) ) ) {
			return;
		}

		// If still inside the same widget, keep button visible
		var widget = hoveredWidget;
		if ( widget && e.relatedTarget && widget.contains( e.relatedTarget ) ) {
			return;
		}

		// Leaving the widget or moving to nowhere — start hide timer
		clearTimeout( leaveTimer );
		leaveTimer = setTimeout( function () {
			if ( imgBtn && imgBtn.matches( ':hover' ) ) { return; }
			// Don't hide or resume if user is actively editing
			if ( RI.hasSession && RI.hasSession() ) { return; }
			hideImgBtn();
			if ( widget ) {
				resumeSwiper( widget );
				hoveredWidget = null;
			}
		}, 80 );
	} );

	window.addEventListener( 'scroll', function () { hideImgBtn(); }, true );
	window.addEventListener( 'resize', function () { hideImgBtn(); } );

	// Resume autoplay when clicking next/prev navigation buttons
	document.addEventListener( 'click', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		if ( ! e.target.closest ) { return; }
		var navBtn = e.target.closest( '.elementor-swiper-button' );
		if ( ! navBtn ) { return; }
		var widget = widgetOf( navBtn );
		if ( ! widget ) { return; }
		setTimeout( function () { resumeSwiper( widget ); }, 50 );
	}, false );

	/* --- Handler registration --- */
	// onHover/onLeave are no-ops — all hover logic is handled by the
	// document-level mouseover/mouseout listeners above, so core.js's
	// own 100ms mouseout timer doesn't cause flicker.
	var handler = {
		onClick: function ( event, widget, ctx ) {
			handleClick( event, widget, ctx );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'slides', handler );

} )( window.RomanInline2 );

