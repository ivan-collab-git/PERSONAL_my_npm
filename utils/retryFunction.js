// - Receives a callback of a function you want to retry until succesful, the callback should throw an error when it fails, otherwise it will be interpreted
// as a succesful run and won't be executed again.
// - As a second parameter you should pass an ordered array of parameters that your function resceives
// - The function will return the vaule that your callback returns
async function retryFunctionAsync( callbackFun, callbackParams, retries, timeout, retryMessage = "Retrying function call." ){
    try{
        return await callbackFun(...callbackParams)
    }
    catch( e ){ 
        console.error( e.message )
        if( retries >= 0 ){ 
            console.log( retryMessage )
            await new Promise( resolve => setTimeout( resolve, timeout ))
            return await retryFunctionAsync( callbackFun, callbackParams, retries - 1, timeout, retryMessage )
        }
        else{
            throw new Error( "Failed to execute function, no more retries attempts left." )
        }
    }
}

export { retryFunctionAsync }