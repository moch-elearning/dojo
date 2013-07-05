/**
    Impliment a store that wraps the WebSQL interface user in many browsers and
    in phonegab
*/
define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/Deferred',
    'dojo/store/util/QueryResults',
    'dojo/store/util/SimpleQueryEngine'
], function( declare, lang, Deferred, QueryResults, SimpleQueryEngine ) {

    if( ! window.openDatabase )
        alert( 'WebSQL is not supported by your browser!' );

    return declare( null, {
        // Name of the database to use
        db_name: null,

        // Name of the table to access
        table_name: null,

        // What fields to return when requesting a row (this may include some joint values)
        // make sure the id of the row are the same as the id of the main table row
        select_fields: '*',

        // a set of fields that we can manipulate on in the main table
        meta: [ 'id' ],

        // A set of joins, that may be used for getting data, all inserts are one on the main table alone
        joins: [],  // array of {table_name:,on:,type:} -- works only in select and insert

        // info description of the database
        info: '',

        // the initial size of the database
        max_size: 1024 * 1024 * 1,

        // Version number used by some WebSQL implimentations (no phonegab)
        version: '1.0',

        // The id og key value for the store main table
        idProperty: 'id',

        // Enable SQL tracing the the console log
        trace: false,

        constructor: function( args ) {
            lang.mixin( this, args );

            if( typeof this.db_name != 'string' )
                throw Error( 'missing name of database' );

            if( typeof this.table_name != 'string' )
                throw Error( 'missing the tablename of the table' );

            this._meta = {};
            for( m in this.meta )
                this._meta[this.meta[ m ]] = '?';

            var self = this;

            this._conn = window.openDatabase( this.db_name, this.version, this.info, this.max_size );

            if( typeof this.onDatabaseCreate == 'function' ) {
                this._conn.transaction( function( t ) {
                    self.onDatabaseCreate( t );
                });
            }
        },

        /* Called when the database are ready, but only once at the creation of an instance
        onDatabaseCreate: function( db ) {
        },*/

        getIdentity: function( item ) {
            return item[this.idProperty];
        },

        _exec: function( stmt, vals ) {
            var d = new Deferred();

            this._conn.transaction( function( t ) {
                t.executeSql( stmt, vals,
                    function( t, r ) {
                        d.resolve( r );
                    },
                    function( t, e ) {
                        console.log( "SQLerror: '", e.message, "' in ", stmt );
                        d.reject( e );
                    }
                );
            });

            return d;
        },

        _make_join_stmt: function() {
            var stmt = '';

            for( i in this.joins ) {
                var j = this.joins[ i ];
                stmt += (j.type ? ' ' + j.type: '') + ' JOIN ' + j.table_name + ' ON ' + j.on + ' ';
            }

            return stmt;
        },

        /**
            Get a row from the DB using the given key.
            Errors will be handled in the SQL DB, as we do not know much about the
            meta data.
        */
        get: function(id) {
            var d = new Deferred();

            var stmt = 'SELECT ' + this.select_fields + ' FROM ' + this.table_name + this._make_join_stmt() +
                ' WHERE ' + this.idProperty + ' = ?';

            if( this.trace )
                console.log( stmt );

            this._exec( stmt, [id] ).then(
                function( r ) {
                    d.resolve( r.rows.item( 0 ));
                }, function( e ) {
                    d.reject( e );
                }
            );

            return d;
        },

        /**
            Put data into the SQL database, using data found on the item. Please note the
            if the data on the item does not match the DB it is up to the DB to handle that
            as an SQL error.

            If no id has been found in the item, it will try to add it instead
        */
        put: function( item ) {
            if( !this.getIdentity( item ))
                return this.add( item );

            var d = new Deferred();

            // Make SQL statement
            var defs = [],
                vals = [];

            for( i in item ) {
                if( i != this.idProperty && this._meta[ i ] ) {
                    defs.push( i + ' = ?');
                    vals.push( item[ i ] );
                }
            }

            vals.push( this.getIdentity( item ));

            var stmt = 'UPDATE ' + this.table_name;
            stmt += ' SET ' + defs.join(',');
            stmt += ' WHERE ' + this.idProperty + ' = ?';

            if( this.trace )
                console.log( stmt );

            this._exec( stmt, vals ).then(
                function( r ) {
                    d.resolve( true );
                },
                function( e ) {
                    d.reject( e );
                }
            );

            return d;
        },

        add: function( item ) {
            var d = new Deferred();

            var defs = [],
                subs = [],
                vals = [];

            for( i in item ) {
                if( this._meta[ i ] ) {
                    defs.push( i );
                    subs.push( '?' );
                    vals.push( item[ i ] );
                }
            }

            var stmt = 'INSERT INTO ' + this.table_name;
            stmt += ' (' + defs.join(',') + ')';
            stmt += ' VALUES(' + subs.join( ',' ) + ')';

            if( this.trace )
                console.log( stmt );

            var self = this;

            this._exec( stmt, vals).then(
                function( r ) {
                    self.get( r.insertId ).then( function( r ) {
                        d.resolve( r );
                    });
                },
                function( e ) {
                    d.reject( e );
                }
            );

            return d;
        },

        remove: function( id ) {
            var d = new Deferred();
            var stmt = 'DELETE FROM ' + this.table_name + ' WHERE ' + this.idProperty + ' = ?';

            console.log( stmt );

            this._exec( stmt, [id] ).then(
                function( r ) {
                    d.resolve( true );
                },
                function( e ) {
                    d.reject( e );
                }
            );

            return d;
        },

        queryEngine: SimpleQueryEngine,

        query: function( query, options ) {
            options = options || {};

            var d = new Deferred();

            var q = [], v = [];
            if(query && typeof query == 'object') {
                for( i in query ) {
                    q.push( i + ' = ?' );
                    v.push( query[ i ] );
                }
            }

            var stmt = ' FROM ' + this.table_name + this._make_join_stmt();

            if( q && q.length > 0)
                stmt += ' WHERE ' + q.join( ' AND ' );

            this._exec( 'SELECT count(*) AS cnt' + stmt, v ).then( lang.hitch( this, function( r ) {
                d.total = r.rows.item( 0 ).cnt;

                if( options.sort ) {
                    if( options.sort.length > 0 ) {
                        var elms = [];

                        for( i in options.sort) {
                            var s = options.sort[ i ];

                            if( typeof s.attribute == 'string' )
                                elms.push( s.attribute + (s.descending ? ' DESC' : ' ASC'));
                        }
                        stmt += ' ORDER BY ' + elms.join( ',' );
                    }
                }

                if( options.count >= 0 )
                    stmt += ' LIMIT ' + options.count

                if( options.count >= 0 )
                    stmt += ' OFFSET ' + options.start;

                stmt = 'SELECT ' + this.select_fields + stmt;

                if( this.trace )
                    console.log( stmt );

                this._exec( stmt, v ).then(
                    function( r ) {
                        var res = [];
                        for( i = 0; i < r.rows.length; i++ )
                            res.push( r.rows.item( i ));

                        d.resolve( res );
                    },
                    function( e ) {
                        d.reject( e );
                    }
                );
            }));

            return QueryResults( d );
        }
    });
});
