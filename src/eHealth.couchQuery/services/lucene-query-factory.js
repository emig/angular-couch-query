'use strict';

angular
  .module('eHealth.couchQuery.services')
  .provider('luceneQueryFactory', function () {
    var db,
        searchDocument;
    this.setDb = function(newDb) {
      db = newDb;
    };
    this.setSearchDocument = function(newSearchDocument) {
      searchDocument = newSearchDocument;
    };
    this.$get = ['$http', 'requestPaginatorFactory', 'foldToAscii', function($http, requestPaginatorFactory, foldToAscii) {
      function create(options) {
        options = options || {};
        var fields = {},
            free = false,
            fineGrainFields = options.fineGrainFields || {};
        var query = {
          searchField: function(key, value) {
            fields[key] = {
              value: value
            };
            if (value === undefined || (angular.isArray(value) && !value.length)) {
              delete fields[key];
            }
            return query;
          },
          searchFieldEitherOr: function(key, value) {
            if (Object.keys(value).length) {
              fields[key] = {
                type: 'eitherOr',
                value: value
              };
            } else {
              delete fields[key];
            }
            return query;
          },
          searchFieldNot: function(key, value) {
            function isNotValue(candidate) { return candidate !== value; }
            if (key in fineGrainFields) {
              fields[key] = {
                value: fineGrainFields[key].filter(isNotValue)
              };
            } else {
              query.searchField(key, value);
              fields[key].type = 'not';
            }
            return query;
          },
          clearField: function(key) {
            delete fields[key];
            return query;
          },
          searchFree: function(value) {
            free = value;
            return query;
          },
          clearFree: function() {
            free = false;
            return query;
          },
          clearAll: function() {
            free = false;
            fields = {};
            return query;
          },
          getSearchExpression: function() {
            var terms = Object.keys(fields)
              .map(function (key) {
                function addLabel(key, value) {
                  if (angular.isUndefined(value)) {
                    value = fields[key].value;
                  }
                  var queryValue = angular.isArray(value) ?
                    '(' + value.map(foldToAscii).join(' OR ') + ')' :
                    foldToAscii(value);
                  return key+':'+queryValue;
                }
                if (fields[key].type === 'not') {
                  return 'NOT '+addLabel(key);
                } else if (fields[key].type === 'eitherOr') {
                  var labeled = Object.keys(fields[key].value).filter(function(k) {
                    // Filter undefined and empty array values
                    var val = fields[key].value[k];
                    return angular.isDefined(val) &&
                           (!angular.isArray(val) || val.length > 0);
                  }).map(function(k) {
                    return addLabel(k, fields[key].value[k]);
                  });
                  return labeled.length ? '(' + labeled.join(' OR ') + ')' : '';
                } else {
                  return addLabel(key);
                }
              })
              .filter(function (term) {
                // remove empty terms
                return angular.isDefined(term) && term !== '';
              });
            if (free) {
              terms.push(foldToAscii(free));
            }
            return terms.join(' AND ');
          },
          run: function(initialParams, initialOptions){
            initialParams = initialParams || {};
            initialOptions = initialOptions || {};
            var q = query.getSearchExpression();
            angular.extend(initialParams, {
              include_docs: true
            });
            var config = {
              withCredentials: true
            };
            if (q === '') {
              return requestPaginatorFactory(function(params) {
                config.params = params;
                return $http
                  .get(db+'/_design/frontend/_view/by_contact_createdon', config)
                  .then(function(response) {
                    return response.data;
                  });
              }, initialParams, initialOptions);
            } else {
              initialParams.q = q;
              initialOptions = angular.extend({
                unique: true
              }, initialOptions);
              // when a new index is being calculated by couch-lucene,
              // all other indexes are blocked and return 500! accepting
              // stale results allows the application to work
              // continuously
              initialParams.stale = 'ok';
              // with Lucene, we specify the search field in the
              // request, together with the direction
              if (options.sortField) {
                var direction = initialParams.descending ? '\\' : '/';
                initialParams.sort = angular.isArray(options.sortField) ?
                  direction+options.sortField.join(','+direction) :
                  direction+options.sortField;
                delete initialParams.descending;
              }
              return requestPaginatorFactory(function(params) {
                config.params = params;
                return $http
                  .get(db+'/_fti/_design/'+searchDocument, config)
                  .then(function(response) {
                    return response.data;
                  });
              }, initialParams, initialOptions);
            }
          }
        };
        return query;
      }
      return {
        create: create
      };
    }];
  });
