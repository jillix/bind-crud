crud
====

CRUD for mono

####Example config with flow:

```js
config: {
    myMiid: {
        myEvent: ['read', 'update', 'create', 'delete']
    }
}
```

All these events must have two parameters:

 * the **CRUD object** defined by the CRUD module. See **example request data**.
 * the **callback** to be called with the results when the operation completes.

####Fetch templates
If an array is send to `self.emit('read')` as data CRUD will fetch the templates inside the array.
Normal queries for templates are working also.
Templates are always initialized before returned.

####Example request data:
```js
{
    // the template that this CRUD object will be validated against
    t: 'templateType',
    // the query object in MongoDB format
    q: {/*query object*/},
    // the document object (updates) in MongoDB format
    d: {/*update document*/},
    // the CRUD operation options in node-monogdb-native (NodeJs MongoDb driver) format
    o: {/*options*/},
    // don't make joins
    noJoins: true,
    // don't merge template
    noMerge: true
}
```

####Template config
```js
myTemplate = {
    _id: myTemplateItemId,
    _tp: [_templateTemplateId],
    db: 'dbName',
    collection: 'collectionName',
    name: 'template_name',
    roles: {
        // set any combination of c, r, u or d in access
        'roleId': {access: 'crud'},
        // optional template configuration overwriting
        // the only supported template properties are: options, links, and schema
        'config': {
            'options': {
                'html': 'another/html/file.html'
            },
            'links': {
                // ...
            },
            'schema': {
                ...
            }
        }
    },
    // add a role with access rights to every item
    itemAccess: 'crud',
    options: {
        label: {
            de: 'Template Label'
        },
        order: 5,
        html: '/myTemplate.html',
        sort: [['sort.field', 1]],
        // a hidden fixed filter to display only the customers that are HB
        filters: [
            {
                field: 'filterFIeld',
                operator: 'exists',
                value: true,
                hidden: true,
                fixed: true
            }
        ]
    },
    // plug custom code
    on: {
        create: {
            myCustomEventA: [arg1, argN]
        },
        read: {
            myCustomEventB: [arg1, argN]
        },
        update: {
            myCustomEventC: [arg1, argN]
        },
        delete: {
            myCustomEventD: [arg1, argN]
        }
    },

    links: [
        // see crud links module
    ],
    schema: {
        // modm schema
    }
}
```

### Change Log

#### `dev`

- add fixes and new featured here!

#### `v0.2.9`
- fixed fetch template requests that were not converting `$in` `string` arrays into `ObjectId` arrays
- fixed template cache retrieval problem

#### `v0.2.8`
- fixed the cursor constructor name: `Cursor` instead of `Object`

#### `v0.2.7`
- TODO

#### `v0.2.6`

- fixed client bug when merging templates: links were polluting the template cache

#### `v0.2.5`

- fixed bug in recursive query conversion

#### `v0.2.4`

- added date conversion

#### `v0.2.3`

- set data as request.result

#### `v0.2.2`

- overwrite request.method. Return error in createError function

#### `v0.2.1`

- add fixed `cloneJSON` bug when handling `ObjectID`'s

#### `v0.2.0`

- added role template configuration overwriting

#### `v0.1.1`

- fixed wrong `M.on` server configuration for the `crud_read` event that was using `create` as the model operation to call

#### `v0.1.0`

- initial release
