import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import fs from 'fs';
import PQueue from 'p-queue'
import path from "path";


async function downloadDirectoryConcurrently( bucketName, prefix, s3, localDirectory, concurrency, retries ){

    let downloadQueue = new PQueue({ concurrency });

    await downloadDirectory( bucketName, prefix, s3, localDirectory, downloadFileQueueFunction )

    await new Promise( (resolve, reject) => {
        downloadQueue.onIdle().then( () => {
            console.log('All files have been downloaded.');
            resolve()
        })
    })

    function downloadFileQueueFunction( s3, localFilePath, objectKey ){
        return downloadQueue.add( async () => await downloadFile( s3, localFilePath, objectKey, retries ));
    }
    
    async function downloadFile( s3, localFilePath, objectKey, retries = 4 ){
        console.log(`Downloading ${objectKey} to ${localFilePath}`);

        let response = await s3.send(new GetObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
        }));

        let fileStream = fs.createWriteStream(localFilePath);
        try{
            await new Promise((resolve, reject) => {
                response.Body.pipe(fileStream);
                fileStream.on('finish', resolve);
                fileStream.on('error', reject);
            });
        }
        catch{
            console.error("Error downloading file:", localFilePath)
            if( retries ){ 
                console.log("Retrying download: ", localFilePath)
                await downloadFile( s3, localFilePath, objectKey, retries - 1 )
            }
            else{
                console.error( `Failed downloading ${ localFilePath } file after all attempts.` )
            }
        }
    }

    async function getAllFileNames(bucketName, prefix, s3) {
        let allObjectKeys = [];
        let continuationToken;
        try{
            do {
                // List objects with the specified prefix
                let listCommand = new ListObjectsV2Command({
                    Bucket: bucketName,
                    Prefix: prefix,
                    ContinuationToken: continuationToken,
                });

                let listedObjects = await s3.send(listCommand)

                allObjectKeys = [...listedObjects.Contents.map((object) => ({ Key: object.Key })) , ...allObjectKeys]

                if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
                    break;
                }
                // Update continuation token for pagination
                continuationToken = listedObjects.NextContinuationToken;

            } while (continuationToken); // Continue until all objects are listed and deleted
        } catch (err) {
            console.error("Error listing directory recursively:", err);
        }
        allObjectKeys = [...new Set( allObjectKeys )]
        return allObjectKeys;
    }

    async function downloadDirectory( bucketName, prefix, s3, localDirectory, downloadFileQueueFunction ){
        try {
            /*/
            let listCommand = new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: prefix,
            });
            let listResponse = await s3.send(listCommand);
    */
            let listResponse = await getAllFileNames(bucketName, prefix, s3)

            if (!listResponse || listResponse.length === 0) {
                console.log(`No files found in directory: ${prefix}`);
                return;
            }

            for (let object of listResponse) {
                let objectKey = object.Key;
                let relativePath = objectKey.replace(prefix, ""); // Remove prefix to get relative path
                let localFilePath = path.join(localDirectory, relativePath);
    
                if (objectKey.endsWith("/")) {
                    // It's a directory; we should recursively process it (though S3 doesn't explicitly have directories)
                    console.log(`Found directory: ${objectKey}, but will skip as directories are implied.`);
                    await downloadDirectory( bucketName, prefix, s3, localDirectory, downloadFileQueueFunction );  // Recursive call for subdirectory
                } else {
                    // It's a file; download it
                    let localDir = localFilePath.substring(0, localFilePath.lastIndexOf("/"));
                    fs.mkdirSync(localDir, { recursive: true });
    
                    downloadFileQueueFunction( s3, localFilePath, objectKey )
                }
            }
        } catch (err) {
            console.error("Error downloading directory:", err);
        }
    }
}

async function uploadDirectoryConcurrently( bucketName, prefix, s3, localDirectory, concurrency, retries ){

    let uploadQueue = new PQueue({ concurrency });

    await new Promise( (resolve, reject) => {
        uploadQueue.onIdle().then(() => {
            console.log('All files have been uploaded.');
            resolve()
        })
    })

    await uploadDirectory( bucketName, prefix, s3, localDirectory, uploadFileQueueFunction )

    function uploadFileQueueFunction( s3, localFilePath, key ){
        return uploadQueue.add( async () => uploadFile( s3, localFilePath, key, retries ));
    }

    async function uploadFile( s3, localFilePath, key, retries = 4 ){
        let fileStream = fs.createReadStream(localFilePath);
        console.log(`Uploading ${localFilePath} to s3://${bucketName}/${key}`);
        try{
            await s3.send(
                new PutObjectCommand({
                    Bucket: bucketName,
                    Key: key,
                    Body: fileStream,
                })
            );
        }
        catch{
            console.error("Error uploading file:", localFilePath)
            if( retries ){ 
                console.log("Retrying upload: ", localFilePath)
                await uploadFile( s3, localFilePath, key, retries - 1 )
            }
            else{
                console.error( `Failed uploading ${ localFilePath } file after all attempts.` )
            }
        }
    }

    async function uploadDirectory( bucketName, prefix, s3, localDirectory, uploadFileQueueFunction ) {
        try {
            // Get all files in the directory recursively
            let files = fs.readdirSync(localDirectory, { withFileTypes: true });
    
            for (let file of files) {
                let localFilePath = path.join(localDirectory, file.name);
                let key = path.join(prefix, file.name); // Destination path in S3
    
                if (file.isDirectory()) await uploadDirectory( bucketName, key, s3, localFilePath, uploadFileQueueFunction );
                else uploadFileQueueFunction( s3, localFilePath, key )
            }
        } catch (err) {
            console.error("Error uploading directory:", err);
        }
    }
}


async function deleteDirectoryInBatches( bucketName, prefix, s3 ){
    try {
        let continuationToken;
        do {
            // List objects with the specified prefix
            let listCommand = new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            });
            let listedObjects = await s3.send(listCommand);

            if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
                console.log("No more objects to delete.");
                break;
            }

            // Prepare objects for deletion
            let deleteParams = {
                Bucket: bucketName,
                Delete: {
                    Objects: listedObjects.Contents.map((object) => ({ Key: object.Key })),
                },
            };

            // Delete the batch of objects
            let deleteCommand = new DeleteObjectsCommand(deleteParams);
            let deleteResponse = await s3.send(deleteCommand);

            console.log("Deleted objects:", deleteResponse.Deleted);

            // Update continuation token for pagination
            continuationToken = listedObjects.NextContinuationToken;

        } while (continuationToken); // Continue until all objects are listed and deleted
    } catch (err) {
        console.error("Error deleting directory recursively:", err);
    }
}

export { downloadDirectoryConcurrently, uploadDirectoryConcurrently, deleteDirectoryInBatches }