/**
 * Roman Inline 2 — Pro blockquote widget handler.
 *
 * - Click content → inline edit (rich text).
 * - Click author → inline edit (text).
 * - Click tweet label → inline edit (text).
 *
 * Controls: blockquote_content, author_name, tweet_button_label.
 * Markup: .elementor-blockquote__content, .elementor-blockquote__author,
 *         .elementor-blockquote__tweet-label.
 */
( function ( RI ) {
	'use strict';

	if ( ! RI ) { return; }

	const SELECTOR = '.elementor-widget-blockquote[data-id]';

	function widgetOf( el ) {
		return el.closest && el.closest( SELECTOR );
	}

	function findFieldByKey( res, key ) {
		return ( res.fields || [] ).filter( function ( f ) { return f.key === key; } )[ 0 ];
	}

	/* --- Handler --- */
	const handler = {
		onClick: function ( event, widget, ctx ) {
			const anchor = event.target.closest && event.target.closest( 'a' );
			if ( anchor && widget.contains( anchor ) ) {
				event.preventDefault();
				event.stopPropagation();
			}

			ctx.getFields().then( function ( res ) {
				// Content
				const contentEl = widget.querySelector( '.elementor-blockquote__content' );
				if ( contentEl && ( event.target === contentEl || contentEl.contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'blockquote_content' );
					if ( field ) {
						ctx.editText( contentEl, { key: field.key, kind: field.kind || 'rich_text', isAtomic: false } );
						return;
					}
				}

				// Author
				const authorEl = widget.querySelector( '.elementor-blockquote__author' );
				if ( authorEl && ( event.target === authorEl || authorEl.contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'author_name' );
					if ( field ) {
						ctx.editText( authorEl, { key: field.key, kind: 'text', isAtomic: false } );
						return;
					}
				}

				// Tweet label
				const tweetEl = widget.querySelector( '.elementor-blockquote__tweet-label' );
				if ( tweetEl && ( event.target === tweetEl || tweetEl.contains( event.target ) ) ) {
					const field = findFieldByKey( res, 'tweet_button_label' );
					if ( field ) {
						ctx.editText( tweetEl, { key: field.key, kind: 'text', isAtomic: false } );
						return;
					}
				}

				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} ).catch( function () {
				ctx.toast( ctx.i18n.nothingEditable || 'Nothing editable here', 'error' );
			} );
		},
		onHover: function () {},
		onLeave: function () {}
	};

	RI.register( 'blockquote', handler );

} )( window.RomanInline2 );
