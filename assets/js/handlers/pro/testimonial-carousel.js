/**
 * Roman Inline 2 — Pro testimonial-carousel widget handler.
 *
 * Repeater control 'slides' (inherited from carousel base) with sub-fields:
 *   - content  (TEXTAREA) → inline edit on click
 *   - image    (MEDIA)    → "Change Image" button on hover
 *   - name     (TEXT)     → inline edit on click
 *   - title    (TEXT)     → inline edit on click
 *
 * The testimonial carousel renders swiper slides. Only the active (visible)
 * slide is editable at any time.
 *
 * Markup: .swiper-slide, .elementor-testimonial__text, .elementor-testimonial__name,
 *         .elementor-testimonial__title, .elementor-testimonial__image img.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const SELECTOR = '.elementor-widget-testimonial-carousel[data-id]';

	let imgBtn = null;
	let hoveredWidget = null;
	let leaveTimer = null;

	function widgetOf( el ) {
		if ( ! el.closest ) { return null; }
		return el.closest( SELECTOR );
	}

	function findRepeaterField( res ) {
		return ( res.fields || [] ).filter( function ( f ) { return 'repeater' === f.kind; } )[ 0 ];
	}

	function getSlides( widget ) {
		return widget.querySelectorAll( '.swiper-slide' );
	}

	function repeaterId( slide ) {
		const cls = slide.className || '';
		const m = cls.match( /elementor-repeater-item-([a-f0-9]+)/ );
		return m ? m[ 1 ] : null;
	}

	function getActiveSlide( widget ) {
		const allSlides = getSlides( widget );
		let activeEl = null;
		for ( let i = 0; i < allSlides.length; i++ ) {
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
		const repId = repeaterId( activeEl );
		const realSlides = [];
		for ( let j = 0; j < allSlides.length; j++ ) {
			if ( ! allSlides[ j ].classList.contains( 'swiper-slide-duplicate' ) ) {
				realSlides.push( allSlides[ j ] );
			}
		}
		if ( repId ) {
			for ( let k = 0; k < realSlides.length; k++ ) {
				if ( repeaterId( realSlides[ k ] ) === repId ) {
					return { el: activeEl, index: k };
				}
			}
		}
		for ( let m = 0; m < realSlides.length; m++ ) {
			if ( realSlides[ m ] === activeEl ) {
				return { el: activeEl, index: m };
			}
		}
		return { el: activeEl, index: 0 };
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

	/* --- "Change Image" button --- */
	function ensureImgBtn() {
		if ( imgBtn ) { return; }
		imgBtn = document.createElement( 'button' );
		imgBtn.type = 'button';
		imgBtn.className = 'ri2-imgbtn ri2-ui';
		imgBtn.innerHTML = '<span class="dashicons dashicons-format-image"></span> ' + ( RI.i18n.changeImage || 'Change Image' );
		imgBtn.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopPropagation();
			if ( ! hoveredWidget ) { return; }
			const widget = hoveredWidget;
			hideImgBtn();
			pauseSwiper( widget );
			const active = getActiveSlide( widget );
			if ( ! active ) { return; }
			const img = active.el.querySelector( '.elementor-testimonial__image img' );
			if ( ! img ) { return; }
			const ctx = RI.ctx( widget );
			ctx.getFields().then( function ( res ) {
				const field = findRepeaterField( res );
				if ( ! field ) { return; }
				ctx.openMedia( {
					onSelect: function ( attachment ) {
						ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
						const newUrl = attachment.url || ( attachment.sizes && attachment.sizes.full && attachment.sizes.full.url ) || '';
						if ( img && newUrl ) {
							img.src = newUrl;
						}
						ctx.saveRepeaterItem( field.key, active.index, 'image', attachment.id )
							.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
							.catch( function ( err ) { ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' ); } );
					}
				} );
			} );
		} );
		imgBtn.addEventListener( 'mousedown', function ( e ) { e.preventDefault(); } );
		document.body.appendChild( imgBtn );
	}

	function showImgBtn( widget ) {
		ensureImgBtn();
		clearTimeout( leaveTimer );
		hoveredWidget = widget;
		const active = getActiveSlide( widget );
		if ( ! active ) { hideImgBtn(); return; }
		const img = active.el.querySelector( '.elementor-testimonial__image img' );
		if ( ! img ) { hideImgBtn(); return; }
		const r = img.getBoundingClientRect();
		if ( r.width < 24 || r.height < 24 ) { hideImgBtn(); return; }
		imgBtn.style.top = ( r.top + 8 ) + 'px';
		imgBtn.style.left = ( r.left + 8 ) + 'px';
		imgBtn.classList.add( 'is-visible' );
	}

	function hideImgBtn() {
		if ( imgBtn ) { imgBtn.classList.remove( 'is-visible' ); }
	}

	/* --- Hover: show Change Image button + pause Swiper --- */
	document.addEventListener( 'mouseover', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		const widget = widgetOf( e.target );
		if ( ! widget ) { return; }
		if ( hoveredWidget !== widget ) {
			hoveredWidget = widget;
			pauseSwiper( widget );
		}
		// Only show if the hovered element is inside the testimonial image
		const imgWrap = e.target.closest && e.target.closest( '.elementor-testimonial__image' );
		if ( ! imgWrap || ! widget.contains( imgWrap ) ) { return; }
		RI.ctx( widget ).getFields().then( function ( res ) {
			if ( ! RI.isActive() ) { return; }
			if ( findRepeaterField( res ) ) {
				showImgBtn( widget );
			}
		} ).catch( function () {} );
	} );

	document.addEventListener( 'mouseout', function ( e ) {
		if ( ! RI.isActive() ) { return; }
		const widget = hoveredWidget;
		if ( ! widget ) { return; }
		if ( e.relatedTarget && widget.contains( e.relatedTarget ) ) { return; }
		if ( imgBtn && imgBtn.contains( e.relatedTarget ) ) { return; }
		clearTimeout( leaveTimer );
		leaveTimer = setTimeout( function () {
			if ( imgBtn && imgBtn.matches( ':hover' ) ) { return; }
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
		const navBtn = e.target.closest( '.elementor-swiper-button' );
		if ( ! navBtn ) { return; }
		const widget = widgetOf( navBtn );
		if ( ! widget ) { return; }
		setTimeout( function () { resumeSwiper( widget ); }, 50 );
	}, false );

	/* --- Handler --- */
	const handler = {
		onClick: function ( event, widget, ctx ) {
			const anchor = event.target.closest && event.target.closest( 'a' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			const active = getActiveSlide( widget );
			if ( ! active ) {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
				return;
			}

			ctx.getFields().then( function ( res ) {
				const field = findRepeaterField( res );
				if ( ! field ) {
					ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
					return;
				}

				// Image click → replace image
				const img = active.el.querySelector( '.elementor-testimonial__image img' );
				if ( img && ( event.target === img || img.contains( event.target ) ) ) {
					hideImgBtn();
					pauseSwiper( widget );
					ctx.openMedia( {
						onSelect: function ( attachment ) {
							ctx.toast( ctx.i18n.saving || 'Saving…', 'saving' );
							const newUrl = attachment.url || ( attachment.sizes && attachment.sizes.full && attachment.sizes.full.url ) || '';
							if ( img && newUrl ) { img.src = newUrl; }
							ctx.saveRepeaterItem( field.key, active.index, 'image', attachment.id )
								.then( function () { ctx.toast( ctx.i18n.saved || 'Saved', 'ok' ); } )
								.catch( function ( err ) { ctx.toast( ( err && err.message ) || ctx.i18n.saveFailed || 'Save failed', 'error' ); } );
						}
					} );
					return;
				}

				// Content
				const textEl = active.el.querySelector( '.elementor-testimonial__text' );
				if ( textEl && ( event.target === textEl || textEl.contains( event.target ) ) ) {
					ctx.editText( textEl, {
						key: field.key, kind: 'text', itemIndex: active.index, subField: 'content'
					} );
					return;
				}

				// Name
				const nameEl = active.el.querySelector( '.elementor-testimonial__name' );
				if ( nameEl && ( event.target === nameEl || nameEl.contains( event.target ) ) ) {
					ctx.editText( nameEl, {
						key: field.key, kind: 'text', itemIndex: active.index, subField: 'name'
					} );
					return;
				}

				// Title
				const titleEl = active.el.querySelector( '.elementor-testimonial__title' );
				if ( titleEl && ( event.target === titleEl || titleEl.contains( event.target ) ) ) {
					ctx.editText( titleEl, {
						key: field.key, kind: 'text', itemIndex: active.index, subField: 'title'
					} );
					return;
				}

				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} ).catch( function () {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'testimonial-carousel', handler );

} )( window.RomanInline2 );
