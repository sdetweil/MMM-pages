function converter(config_data, direction){
	if (direction == 'toForm'){ // convert FROM native object format to form schema array format
		// create entry array
		let nc = []
		// config format is an object, need an extendable array
		Object.keys(config_data.hiddenPages).forEach(c =>{
			// for each key (hidden page name)

			let entry = { name : c,  modulelist: config_data.hiddenPages[c]}

			// save the new field structure in the array
			nc.push( entry)
		})
		// pass back a good copy of the data
		config_data.hiddenPages= JSON.parse(JSON.stringify(nc))
		return config_data
	}
	else if (direction == 'toConfig'){  // convert TO native object from form array
		// create empty object
		let nc = {}
		// form format is an array , need an object for config.js
		config_data.hiddenPages.forEach(e =>{
			// for array element 
			// make an object entry from the two fields in each array element
			nc[e.name]= e.modulelist
		})
		// pass back a good copy of the data
		config_data.hiddenPages= JSON.parse(JSON.stringify(nc))
		return config_data
	}
}
exports.converter=converter