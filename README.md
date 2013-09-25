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
coming soon...
