/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var express    = require('express'),
  app          = express(),
  request      = require('request'),
  path         = require('path'),
  validator    = require('validator'),
  fs           = require('fs'),
  multer       = require('multer'),
  bluemix      = require('./config/bluemix'),
  extend       = require('util')._extend,
  watson       = require('watson-developer-cloud');
var wechat = require('wechat');
var config = {
  token: 'lijingjie123',
  appid: 'appid',
  encodingAESKey: 'encodinAESKey'
};

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
var upload = multer({ storage: storage });

// Bootstrap application settings
require('./config/express')(app);

// if bluemix credentials exists, then override local
var credentialsfortext = extend({
  version: 'v1',
  url : 'https://gateway.watsonplatform.net/natural-language-classifier/api/v1/classifiers',
  username : '967b16fc-23bd-4cbc-9b4a-d26cc10b983b',
  password : 'ozn3sVRtiJrz',
}, bluemix.getServiceCreds('natural_language_classifier')); // VCAP_SERVICES

// Create the service wrapper
var nlClassifier = watson.natural_language_classifier(credentialsfortext);

// if bluemix credentials exists, then override local

// "url": "https://gateway.watsonplatform.net/visual-recognition-beta/api",
//        "username": "d428623a-17f0-46e1-b8ae-8c798593c585",
//        "password": "9JtqFAXXLkNs"
var credentialsforimage = extend({
  version: 'v1',
  username: 'd428623a-17f0-46e1-b8ae-8c798593c585',
  password: '9JtqFAXXLkNs'
}, bluemix.getServiceCreds('visual_recognition')); // VCAP_SERVICES

// Create the service wrapper
var visualRecognition = watson.visual_recognition(credentialsforimage);


app.use(express.query());
app.use('/wechat', wechat('lijingjie123', function (req, res, next) {
    var message = req.weixin;
    if(message.MsgType == 'text'){
    	  
    	  var params = {
		    classifier: process.env.CLASSIFIER_ID || '98A37Cx3-nlc-808', // pre-trained classifier
		    text: message.Content
		  };
    	   nlClassifier.classify(params, function(err,results) {	   	
		    if (err)
		      {
		      	res.reply({ type: "text", content: "Server errors"+err.text+params.text});
		        return next(err);
	          } 
		    else
		     res.reply({ type: "text", content: "最有可能是--》"+results.top_class+'\n'+"Confidence is:"+Math.floor(results.classes[0].confidence * 100) +'%\n'+
		     	                                "其次可能是--》"+results.classes[1].class_name+'\n'+Math.floor(results.classes[1].confidence * 100) +'%\n'+
		     	                                "其次可能是--》"+results.classes[2].class_name+'\n'+Math.floor(results.classes[2].confidence * 100) +'%\n'+
		     	                                "其次可能是--》"+results.classes[3].class_name+'\n'+Math.floor(results.classes[3].confidence * 100) +'%\n'+
		     	                                "" });  
		  });
    	
          
    }
	if(message.MsgType == 'image'){
    	  
		// Classifiers are 0 = all or a json = {label_groups:['<classifier-name>']}
		  var classifier = '0';  // All
		  
		  var imgFile;

          imgFile = request(message.PicUrl+".jpg");
		  
		  
		  var formData = {
			labels_to_check: classifier,
			image_file: imgFile
		  };

		  visualRecognition.recognize(formData, function(err, results) {
			
			if (err)
			{
		      	res.reply({ type: "text", content: "Server errors"+err.text+params.text});
		        return next(err);
	        } 
			else{
				
				var resultinfo = "";
				
				for(var i =0; i < results.images[0].labels.length;i++){
					
					resultinfo += results.images[0].labels[i].label_name + results.images[0].labels[i].label_score +"\n";
					
				}
								
				res.reply({ type: "text", content: "total is ---->"+results.images[0].labels.length+"\n"+resultinfo});
				
			}
			  
		  });
			
    }
   
}));

app.post('/image', upload.single('image'), function(req, res, next) {

  // Classifiers are 0 = all or a json = {label_groups:['<classifier-name>']}
  var classifier = req.body.classifier || '0';  // All
  if (classifier !== '0') {
    classifier = JSON.stringify({label_groups:[classifier]});
  }

  var imgFile;

  if (req.file) {
    // file image
    imgFile = fs.createReadStream(req.file.path);
  } else if(req.body.url && validator.isURL(req.body.url)) {
    // web image
    imgFile = request(req.body.url.split('?')[0]);
  } else if (req.body.url && req.body.url.indexOf('images') === 0) {
    // local image
    imgFile = fs.createReadStream(path.join('public', req.body.url));
  } else {
    // malformed url
    return next({ error: 'Malformed URL', code: 400 });
  }

  var formData = {
    labels_to_check: classifier,
    image_file: imgFile
  };

  visualRecognition.recognize(formData, function(err, result) {
    // delete the recognized file
    if(req.file)
      fs.unlink(imgFile.path);

    if (err)
      next(err);
    else
      return res.json(result);
  });
});

app.get('/', function(req, res) {
  res.render('index');
});
// Call the pre-trained classifier with body.text
// Responses are json
app.post('/', function(req, res, next) {
  var params = {
    classifier: process.env.CLASSIFIER_ID || '98A37Cx3-nlc-808', // pre-trained classifier
    text: req.body.text
  };

  nlClassifier.classify(params, function(err, results) {
    if (err)
      return next(err);
    else
      res.json(results);
  });
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.code = 404;
  err.message = 'Not Found';
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  var error = {
    code: err.code || 500,
    error: err.message || err.error
  };
  console.log('error:', error);

  res.status(error.code).json(error);
});

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);