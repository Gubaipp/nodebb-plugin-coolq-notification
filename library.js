(function (module) {
	'use strict';

	var User = module.parent.require('./user');
	var Topics = module.parent.require('./topics');
	var Categories = module.parent.require('./categories');
	var translator = module.parent.require('../public/src/modules/translator');
	var meta = module.parent.require('./meta');
	var nconf = module.parent.require('nconf');
	var async = module.parent.require('async');
	var request = require('request');

	var forumURL = nconf.get('url');

	var plugin = {
		config: {
			webhookURL: '',
			webhookToken: '',
			webhookGroup: '',
			maxLength: '',
			postCategories: '',
			postAt: '',
			topicsOnly: '',
			template: ''
		},
	};

	plugin.init = function (params, callback) {
			function render(req, res, next) {
				res.render('admin/plugins/coolq-notification', {});
			}

			params.router.get('/admin/plugins/coolq-notification', params.middleware.admin.buildHeader, render);
			params.router.get('/api/admin/plugins/coolq-notification', render);

			meta.settings.get('coolq-notification', function (err, settings) {
				for (var prop in plugin.config) {
					if (settings.hasOwnProperty(prop)) {
						plugin.config[prop] = settings[prop];
					}
				}
			});

			callback();
		},

		plugin.postSave = function (post) {
			post = post.post;
			var topicsOnly = plugin.config['topicsOnly'] || 'off';

			if (topicsOnly === 'off' || (topicsOnly === 'on' && post.isMain)) {
				var content = post.content;

				async.parallel({
					user: function (callback) {
						User.getUserFields(post.uid, ['username'], callback);
					},
					topic: function (callback) {
						Topics.getTopicFields(post.tid, ['title', 'slug'], callback);
					},
					category: function(callback) {
						Categories.getCategoryFields(post.cid, ['name'], callback);
					}
				}, function (err, data) {
					var categories = JSON.parse(plugin.config['postCategories']);
					var at = JSON.parse(plugin.config['postAt']);

					if (categories.length === 0 || categories.indexOf(String(post.cid)) >= 0) {
						// Trim long posts:
						var maxQuoteLength = plugin.config['maxLength'] || 1024;
						if (content.length > maxQuoteLength) {
							content = content.substring(0, maxQuoteLength) + '...';
						}
						if (maxQuoteLength === 0) content = '';

						var message = at.indexOf(String(post.cid)) >= 0 ? [{type: 'at', data: {qq: 'all'}}, {type: 'text', data: {text: ' '}}] : [];
						var messageText = plugin.config['template'];
						messageText = messageText.replace(/\{username\}/g, data.user.username);
						messageText = messageText.replace(/\{category\}/g, data.category.name);
						messageText = messageText.replace(/\{title\}/g, data.topic.title);
						messageText = messageText.replace(/\{content\}/g, content);
						messageText = messageText.replace(/\{url\}/g, encodeURI(forumURL + '/topic/' + data.topic.slug));
						message.push({type: 'text', data: {text: messageText}});

						if (plugin.config['webhookURL'] && plugin.config['webhookGroup']) {
							request.post(plugin.config['webhookURL'], {
								json: true,
								headers: plugin.config['webhookToken'] !== '' ? {
									'Authorization': `Bearer ${plugin.config['webhookToken']}`
								} : {},
								body: {
									group_id: plugin.config['webhookGroup'],
									message: message
								}
							});
						}
					}
				});
			}
		},

		plugin.adminMenu = function (headers, callback) {
			translator.translate('[[coolq-notification:title]]', function (title) {
				headers.plugins.push({
					route: '/plugins/coolq-notification',
					icon: 'fa-bell',
					name: title
				});

				callback(null, headers);
			});
		};

	module.exports = plugin;

}(module));
