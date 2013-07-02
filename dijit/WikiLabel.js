define( [
    'dojo/_base/declare',
    'dojo/_base/fx',
    'dojo/dom-construct',
    'dijit/form/_FormValueWidget' ], function( declare, fx, domConstruct, FormValueWidget ) {
    // Parser is found at :
    // http://www.ivan.fomichev.name/2008/04/javascript-creole-10-wiki-markup-parser.html

    var Parse = {
        Simple: {}
    };

    Parse.Simple.Base = function(grammar, options) {
        if (!arguments.length) { return; }

        this.grammar = grammar;
        this.grammar.root = new this.ruleConstructor(this.grammar.root);
        this.options = options;
    };

    Parse.Simple.Base.prototype = {
        ruleConstructor: null,
        grammar: null,
        options: null,

        parse: function(node, data, options) {
            if (options) {
                for (i in this.options) {
                    if (typeof options[i] == 'undefined') { options[i] = this.options[i]; }
                }
            }
            else {
                options = this.options;
            }
            data = data.replace(/\r\n?/g, '\n');
            this.grammar.root.apply(node, data, options);
            if (dojo.isIE) { node.innerHTML = node.innerHTML.replace(/\r?\n/g, '\r\n'); }
        }
    };

    Parse.Simple.Base.prototype.constructor = Parse.Simple.Base;

    Parse.Simple.Base.Rule = function(params) {
        if (!arguments.length) { return; }

        for (var p in params) { this[p] = params[p]; }
        if (!this.children) { this.children = []; }
    };

    Parse.Simple.Base.prototype.ruleConstructor = Parse.Simple.Base.Rule;

    Parse.Simple.Base.Rule.prototype = {
        regex: null,
        capture: null,
        replaceRegex: null,
        replaceString: null,
        tag: null,
        attrs: null,
        children: null,

        match: function(data, options) {
            return data.match(this.regex);
        },

        build: function(node, r, options) {
            var data;
            if (this.capture !== null) {
                data = r[this.capture];
            }

            var target;
            if (this.tag) {
                target = domConstruct.create( this.tag, {}, node );
            }
            else { target = node; }

            if (data) {
                if (this.replaceRegex) {
                    data = data.replace(this.replaceRegex, this.replaceString);
                }
                this.apply(target, data, options);
            }

            if (this.attrs) {
                for (var i in this.attrs) {
                    target.setAttribute(i, this.attrs[i]);
                    if (dojo.isIE && i == 'class') { target.className = this.attrs[i]; }
                }
            }
            return this;
        },

        apply: function(node, data, options) {
            var tail = '' + data;
            var matches = [];

            if (!this.fallback.apply) {
                this.fallback = new this.constructor(this.fallback);
            }

            while (true) {
                var best = false;
                var rule  = false;
                for (var i = 0; i < this.children.length; i++) {
                    if (typeof matches[i] == 'undefined') {
                        if (!this.children[i].match) {
                            this.children[i] = new this.constructor(this.children[i]);
                        }
                        matches[i] = this.children[i].match(tail, options);
                    }
                    if (matches[i] && (!best || best.index > matches[i].index)) {
                        best = matches[i];
                        rule = this.children[i];
                        if (best.index == 0) { break; }
                    }
                }

                var pos = best ? best.index : tail.length;
                if (pos > 0) {
                    this.fallback.apply(node, tail.substring(0, pos), options);
                }

                if (!best) { break; }

                if (!rule.build) { rule = new this.constructor(rule); }
                rule.build(node, best, options);

                var chopped = best.index + best[0].length;
                tail = tail.substring(chopped);
                for (var i = 0; i < this.children.length; i++) {
                    if (matches[i]) {
                        if (matches[i].index >= chopped) {
                            matches[i].index -= chopped;
                        }
                        else {
                            matches[i] = void 0;
                        }
                    }
                }
            }

            return this;
        },

        fallback: {
            apply: function(node, data, options) {
                if (data && dojo.isIE) { // workaround for bad IE
                    data = data.replace(/\n/g, ' \r');
                }
                node.appendChild(document.createTextNode(data));
            }
        }
    };

    Parse.Simple.Base.Rule.prototype.constructor = Parse.Simple.Base.Rule;

    Parse.Simple.Creole = function(options) {
        var rx = {};

        rx.link = '[^\\]|~\\n]*(?:(?:\\](?!\\])|~.)[^\\]|~\\n]*)*';
        rx.linkText = '[^\\]~\\n]*(?:(?:\\](?!\\])|~.)[^\\]~\\n]*)*';
        rx.uriPrefix = '\\b(?:(?:https?|ftp)://|mailto:)';
        rx.uri = rx.uriPrefix + rx.link;
        rx.rawUri = rx.uriPrefix + '\\S*[^\\s!"\',.:;?]';
        rx.interwikiPrefix = '[\\w.]+:';
        rx.interwikiLink = rx.interwikiPrefix + rx.link;
        rx.img = '\\{\\{((?!\\{)[^|}\\n]*(?:}(?!})[^|}\\n]*)*)' +
                 (options && options.strict ? '' : '(?:') +
                 '\\|([^}~\\n]*((}(?!})|~.)[^}~\\n]*)*)' +
                 (options && options.strict ? '' : ')?') +
                 '}}';

        var formatLink = function(link, format) {
            if (format instanceof Function) {
                return format(link);
            }

            format = format instanceof Array ? format : [ format ];
            if (typeof format[1] == 'undefined') { format[1] = ''; }
            return format[0] + link + format[1];
        };

        var g = {
            hr: { tag: 'hr', regex: /(^|\n)\s*----\s*(\n|$)/ },

            br: { tag: 'br', regex: /\\\\/ },

            preBlock: { tag: 'pre', capture: 2,
                regex: /(^|\n)\{\{\{\n((.*\n)*?)\}\}\}(\n|$)/,
                replaceRegex: /^ ([ \t]*\}\}\})/gm,
                replaceString: '$1' },
            tt: { tag: 'tt',
                regex: /\{\{\{(.*?\}\}\}+)/, capture: 1,
                replaceRegex: /\}\}\}$/, replaceString: '' },

            ulist: { tag: 'ul', capture: 0,
                regex: /(^|\n)([ \t]*\*[^*#].*(\n|$)([ \t]*[^\s*#].*(\n|$))*([ \t]*[*#]{2}.*(\n|$))*)+/ },
            olist: { tag: 'ol', capture: 0,
                regex: /(^|\n)([ \t]*#[^*#].*(\n|$)([ \t]*[^\s*#].*(\n|$))*([ \t]*[*#]{2}.*(\n|$))*)+/ },
            li: { tag: 'li', capture: 0,
                regex: /[ \t]*([*#]).+(\n[ \t]*[^*#\s].*)*(\n[ \t]*\1[*#].+)*/,
                replaceRegex: /(^|\n)[ \t]*[*#]/g, replaceString: '$1' },

            table: { tag: 'table', capture: 0,
                regex: /(^|\n)(\|.*?[ \t]*(\n|$))+/ },
            tr: { tag: 'tr', capture: 2, regex: /(^|\n)(\|.*?)\|?[ \t]*(\n|$)/ },
            th: { tag: 'th', regex: /\|+=([^|]*)/, capture: 1 },
            td: { tag: 'td', capture: 1,
                regex: '\\|+([^|~\\[{]*((~(.|(?=\\n)|$)|' +
                       '\\[\\[' + rx.link + '(\\|' + rx.linkText + ')?\\]\\]' +
                       (options && options.strict ? '' : '|' + rx.img) +
                       '|[\\[{])[^|~]*)*)' },

            singleLine: { regex: /.+/, capture: 0 },
            paragraph: { tag: 'p', capture: 0,
                regex: /(^|\n)([ \t]*\S.*(\n|$))+/ },
            text: { capture: 0, regex: /(^|\n)([ \t]*[^\s].*(\n|$))+/ },

            strong: { tag: 'strong', capture: 1,
                regex: /\*\*([^*~]*((\*(?!\*)|~(.|(?=\n)|$))[^*~]*)*)(\*\*|\n|$)/ },
            em: { tag: 'em', capture: 1,
                regex: '\\/\\/(((?!' + rx.uriPrefix + ')[^\\/~])*' +
                       '((' + rx.rawUri + '|\\/(?!\\/)|~(.|(?=\\n)|$))' +
                       '((?!' + rx.uriPrefix + ')[^\\/~])*)*)(\\/\\/|\\n|$)' },

            img: { regex: rx.img,
                build: function(node, r, options) {
                    var alt_text = r[2] === undefined
                        ? (options && options.defaultImageText ? options.defaultImageText : '')
                        : r[2].replace(/~(.)/g, '$1');
                    var url = ((options && options.defaultImagePath) ? options.defaultImagePath : '') + r[1];

                    if( typeof options.onImage == 'function' ) {
                        options.onImage( node, url, alt_text );
                    } else {
                        domConstruct.create( 'img', {
                            src: url,
                            alt: alt_text
                        }, node );
                    }
                } },

            namedUri: { regex: '\\[\\[(' + rx.uri + ')\\|(' + rx.linkText + ')\\]\\]',
                build: function(node, r, options) {
                    var link = domConstruct.create('a', {}, node);
                    link.href = r[1];
                    if (options && options.isPlainUri) {
                        link.appendChild(document.createTextNode(r[2]));
                    }
                    else {
                        this.apply(link, r[2], options);
                    }
                } },

            namedLink: { regex: '\\[\\[(' + rx.link + ')\\|(' + rx.linkText + ')\\]\\]',
                build: function(node, r, options) {
                    var link = domConstruct.create('a', {
                        href: options && options.onLinkFormat
                            ? formatLink(r[1].replace(/~(.)/g, '$1'), options.onLinkFormat)
                            : r[1].replace(/~(.)/g, '$1')
                    }, node );
                    this.apply(link, r[2], options);
                } },

            plugin: { regex: '<<(.+)>>',
                build: function( node, r, options ) {
                    var args = r[1];

                    if( typeof options.onPlugin == 'function' )
                        options.onPlugin( node, args );
                }
            },

            unnamedUri: { regex: '\\[\\[(' + rx.uri + ')\\]\\]',
                build: 'dummy' },
            unnamedLink: { regex: '\\[\\[(' + rx.link + ')\\]\\]',
                build: 'dummy' },
            unnamedInterwikiLink: { regex: '\\[\\[(' + rx.interwikiLink + ')\\]\\]',
                build: 'dummy' },

            rawUri: { regex: '(' + rx.rawUri + ')',
                build: 'dummy' },

            escapedSequence: { regex: '~(' + rx.rawUri + '|.)', capture: 1,
                tag: 'span', attrs: { 'class': 'escaped' } },
            escapedSymbol: { regex: /~(.)/, capture: 1,
                tag: 'span', attrs: { 'class': 'escaped' } }
        };

        g.unnamedUri.build = g.rawUri.build = function(node, r, options) {
            if (!options) { options = {}; }
            options.isPlainUri = true;
            g.namedUri.build.call(this, node, Array(r[0], r[1], r[1]), options);
        };

        g.unnamedLink.build = function(node, r, options) {
            g.namedLink.build.call(this, node, Array(r[0], r[1], r[1]), options);
        };

        g.namedInterwikiLink = { regex: '\\[\\[(' + rx.interwikiLink + ')\\|(' + rx.linkText + ')\\]\\]',
            build: function(node, r, options) {
                var link = domConstruct.create('a', {}, node);

                var m, f;
                if (options && options.onInterwiki) {
                    m = r[1].match(/(.*?):(.*)/);

                    if( typeof options.onInterwiki == 'function' ) {
                        options.onInterwiki( link, m[1], m[2], r[2] );
                    } else {
                        f = options.onInterwiki[m[1]];

                        if (typeof f == 'undefined') {
                            if (!g.namedLink.apply) {
                                g.namedLink = new this.constructor(g.namedLink);
                            }
                            return g.namedLink.build.call(g.namedLink, node, r, options);
                        }

                        link.href = formatLink(m[2].replace(/~(.)/g, '$1'), f);

                        this.apply(link, r[2], options);
                    }
                }
            }
        };

        g.unnamedInterwikiLink.build = function(node, r, options) {
            g.namedInterwikiLink.build.call(this, node, Array(r[0], r[1], r[1]), options);
        };

        g.namedUri.children = g.unnamedUri.children = g.rawUri.children =
                g.namedLink.children = g.unnamedLink.children =
                g.namedInterwikiLink.children = g.unnamedInterwikiLink.children =
            [ g.escapedSymbol, g.img ];

        for (var i = 1; i <= 6; i++) {
            g['h' + i] = { tag: 'h' + i, capture: 2,
                regex: '(^|\\n)[ \\t]*={' + i + '}[ \\t]' +
                       '([^~]*?(~(.|(?=\\n)|$))*)[ \\t]*=*\\s*(\\n|$)'
            };
        }

        g.ulist.children = g.olist.children = [ g.li ];
        g.li.children = [ g.ulist, g.olist ];
        g.li.fallback = g.text;

        g.table.children = [ g.tr ];
        g.tr.children = [ g.th, g.td ];
        g.td.children = [ g.singleLine ];
        g.th.children = [ g.singleLine ];

        g.h1.children = g.h2.children = g.h3.children =
                g.h4.children = g.h5.children = g.h6.children =
                g.singleLine.children = g.paragraph.children =
                g.text.children = g.strong.children = g.em.children =
            [ g.escapedSequence, g.strong, g.em, g.br, g.rawUri,
                g.namedUri, g.namedInterwikiLink, g.namedLink,
                g.unnamedUri, g.unnamedInterwikiLink, g.unnamedLink,
                g.tt, g.img, g.plugin ];

        g.root = {
            children: [ g.h1, g.h2, g.h3, g.h4, g.h5, g.h6,
                g.hr, g.ulist, g.olist, g.preBlock, g.table ],
            fallback: { children: [ g.paragraph ] }
        };

        Parse.Simple.Base.call(this, g, options);
    };

    Parse.Simple.Creole.prototype = new Parse.Simple.Base();

    Parse.Simple.Creole.prototype.constructor = Parse.Simple.Creole;

    return declare( "moch.dijit.WikiLabel", FormValueWidget, {
        templateString: "<label data-dojo-attach-point='focusNode' id='widget_${id}'></label>",

        baseClass: 'mochDijitWikiLabel',

        label: '',

        title: '',

        /**
            Define a function or an array the convert an inter wiki notation
            to either an active pease of javascript or just convert these to
            full size urls.

            Note: The given node is normally an html anchor, and if this does not
            get any 'href' props set, the link will not seem active to the user.

            if this is an array, the key must be the inter wiki name and the result
            must be an valid link.
        */
        onInterwiki: function( node, link_type, link_name, link_label ) {
            console.log( 'interwiki : ', link_name, link_type, link_label );

            dojo.attr( node, 'innerHTML', (link_label) ? link_label : link_name );
        },

        /**
            The path where to find image resources
        */
        defaultImagePath: '/service/resource/',

        /**
            If the link has no name given by the user, this text will be used instead.
        */
        defaultImageText: 'External Link',

        /**
            If this is a function, it will be called everytime the  wiki parser encounter
            an image or resource tag. This makes it possible to insert other elements than
            image depending on the resourse mime type.

            function( node, url, text );
        */
        onResource: null, //   function( node, url, text );

        /**
            Gets an link as defined by the user and return an new href that is valid
            for the user to use.
        */
        onLinkFormat: function( link ) {  // External links
            console.log( 'URI link : ', link );

            return link;
        },

        // Called every time we render a new page, and are done
        onRenderEnd: function() {
        },

        isPlainUri: true,

        /**
            When the user define a plugin this function gets called holding the
            parameters given by the user, and the node where an plugin may be
            build.

            The syntax of the plugin are not for this function to define.
        */
        onPlugin: function( node, args ) { // Plugins
            console.log( 'wiki plugin : ', args );
        },

        constructor: function() {
            this._creole = new Parse.Simple.Creole( this );
        },

        _setValueAttr: function( text ) {
            if( text == undefined )
                text = '';

            var self = this;
            fx.fadeOut({
                node: self.focusNode,
                onEnd: function() {
                    // Empty the current node
                    while( self.focusNode.lastChild )
                        self.focusNode.removeChild(self.focusNode.lastChild);

                    fx.fadeIn( {
                        node: self.focusNode,
                        onBegin: function() {
                            self._creole.parse( self.focusNode, text );
                            self.onRenderEnd( text );
                        }
                    }).play();
                }
            }).play();
        }
    });
});
