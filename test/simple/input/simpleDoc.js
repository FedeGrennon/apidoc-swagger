/**
 * @api {get} /user/id Request User information
 * @apiName GetUser
 * @apiGroup User
 *
 * @apiParam {Number} id Users unique ID.
 * 
 * @apiHeader {string} Authorization     Bearer token authorization. Example `Auhorization='bearer eyJhbGciOiJIUzI....wdgMI'`
 *
 * @apiSuccess {String} firstname Firstname of the User.
 * @apiSuccess {String} lastname  Lastname of the User.
 */