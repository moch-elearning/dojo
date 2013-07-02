/**
    Impliment a store that wraps the WebSQL interface user in many browsers and
    in phonegab
*/
define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/Deferred',
    'dojo/store/util/QueryResults'
], function( declare, lang, Deferred, QueryResults ) {

    if( ! window.openDatabase )
        alert( 'WebSQL is not supported by your browser!' );

    return declare( null, {

        name: null,

        table_name: null,

        select_fields: '*',

        meta: [],

        joins: [],  // array of {table_name:,on:,type:} -- works only in select and insert

        info: '',

        max_size: 1024 * 1024 * 1,

        version: '1.0',

        idProperty: 'id',

        constructor: function( args ) {
            lang.mixin( this, args );

            if( typeof this.name != 'string' )
                throw Error( 'missing name of database' );

            if( typeof this.table_name != 'string' )
                throw Error( 'missing the tablename of the table' );

            if( typeof this.onDatabaseCreate != 'function' )
                throw Error( 'missing the onDatabaseCreate function' );

            this._meta = {};
            for( m in this.meta )
                this._meta[this.meta[ m ]] = '?';

            var self = this;

            this._conn = window.openDatabase( this.name, this.version, this.info, this.size );

            this._conn.transaction( function( t ) {
                self.onDatabaseCreate( t );
            });
        },

        /*
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
                        d.reject( e );
                    }
                );
            });

            return d;
        },

        _make_join_stmt: function() {
            var stmt = '';

            for( j in this.joins ) {
                stmt += ' ' + j.type + ' JOIN ' + j.table_name + ' ON ' + j.on + ' ';
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
        */
        put: function( item ) {
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
            if( this.getIdentity( item ))
                return this.put( item );

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
                        stmt += ' ORDER BY ';

                        for( i in options.sort) {
                            var s = options.sort[ i ];

                            if( typeof s.attribute == 'string' )
                                stmt += s.attribute + (s.descending ? ' DESC' : ' ASC');
                        }
                    }
                }

                if( options.count >= 0 )
                    stmt += ' LIMIT ' + options.count

                if( options.count >= 0 )
                    stmt += ' OFFSET ' + options.start;

                stmt = 'SELECT ' + this.select_fields + stmt;

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
