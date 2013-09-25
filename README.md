crud
====

CRUD for mono

####Example config:

```
listen: ["MIID1", "MIID2", ...]
```

This CRUD module will listen for `find`, `update`, `insert`, and `remove` events comming from these modules
and forward their requests to the server. All these events must have two parameters:

 * the **CRUD object** defined by the CRUD module. See **example below**.
 * the **callback** to be called with the results when the operation completes.

There is also a `getTemplates` event which fetches template data. Pass an array with template names as first parameters and the callback as second.

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
    // the CRUD operation projection in MongoDb format
    f: {/*fields*/}
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
        'roleId': {access: 'crud'}
    },
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
    links: [
        // see crud links module
    ],
    schema: {
        // modm schema
    }
```
