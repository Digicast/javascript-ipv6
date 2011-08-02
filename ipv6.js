if (typeof exports !== 'undefined') {
   var sprintf = require('sprintf').sprintf,
       BigInteger = require('./lib/node/bigint').BigInteger;
}

var v4 = this.v4 = {};
var v6 = this.v6 = {};

v4.GROUPS = 4;
v6.GROUPS = 8;

v4.BITS = 32;
v6.BITS = 128;

v6.SCOPES = {
   0: 'Reserved',
   1: 'Interface local',
   2: 'Link local',
   4: 'Admin local',
   5: 'Site local',
   8: 'Organization local',
   15: 'Global',
   16: 'Reserved'
};

v6.RE_V4 = /(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/g;

v6.RE_BAD_CHARACTERS = /([^0-9a-f:\/%])/ig;
v6.RE_BAD_ADDRESS = /([0-9a-f]{5,}|:{3,}|[^:]:$|^:[^:])/ig;

v6.RE_SUBNET_STRING = /\/\d{1,3}/;
v6.RE_ZONE_STRING = /%.*$/;

function map(array, f) {
   var results = [];

   for (var i = 0; i < array.length; i++) {
      results.push(f(array[i], i));
   }

   return results;
};

/* v4 address constructor */
v4.Address = function(address) {
   this.address = address;
   this.groups = v4.GROUPS;
   this.parsedAddress = this.parse(address);
};

/* parse a v4 address */
v4.Address.prototype.parse = function(address) {
   var groups = address.split('.');

   return groups;
};

/* convert a hex string to a v4 address object */
v4.Address.fromHex = function(hex) {
   var padded = String("00000000" + hex.replace(/:/g, '')).slice(-8);

   var groups = [];

   for (var i = 0; i < 8; i += 2) {
      var h = padded.slice(i, i + 2);

      groups.push(parseInt(h, 16));
   }

   return new v4.Address(groups.join('.'));
};

/* convert a v4 address object to a hex string */
v4.Address.prototype.toHex = function() {
   var output = [];

   for (var i = 0; i < v4.GROUPS; i += 2) {
      var hex = sprintf('%02x%02x',
         parseInt(this.parsedAddress[i], 10),
         parseInt(this.parsedAddress[i + 1], 10));

      output.push(sprintf('%x', parseInt(hex, 16)));
   }

   return output.join(':');
};

/* v6 address constructor */
v6.Address = function(address, opt_groups) {
   this.address = address;

   if (opt_groups === undefined) {
      this.groups = v6.GROUPS;
   } else {
      this.groups = opt_groups;
   }

   this.subnet = '/128';
   this.subnetMask = 128;

   this.zone = '';

   this.error = '';

   this.parsedAddress = this.parse(address);
};

/* convert a BigInteger to a v6 address object */
v6.Address.fromBigInteger = function(bigInteger) {
   var hex = v6.Address.zeroPad(bigInteger.toString(16), 32);

   var groups = [];

   for (var i = 0; i < 8; i++) {
      groups.push(hex.slice(i * 4, (i + 1) * 4));
   }

   return new v6.Address(groups.join(':'));
};

v6.Address.compact = function(address, slice) {
   var s1 = [];
   var s2 = [];

   for (var i = 0; i < address.length; i++) {
      if (i < slice[0]) {
         s1.push(address[i]);
      } else if (i > slice[1]) {
         s2.push(address[i]);
      }
   }

   return s1.concat(['compact']).concat(s2);
};

v6.Address.prototype.isValid = function() {
   return this.valid;
};

v6.Address.prototype.isCorrect = function() {
   return this.address == this.correctForm();
};

v6.Address.prototype.isCanonical = function() {
   return this.address == this.canonicalForm();
};

v6.Address.prototype.isMulticast = function() {
   return this.getType() == 'Multicast';
};

v6.Address.prototype.mask = function(opt_mask) {
   if (opt_mask === undefined) {
      opt_mask = this.subnetMask;
   }

   return this.getBitsBase2(0, opt_mask);
};

function addCommas(number) {
   var r = /(\d+)(\d{3})/;

   while (r.test(number)) {
      number = number.replace(r, '$1,$2');
   }

   return number;
}

v6.Address.prototype.link = function(opt_prefix, opt_class) {
   if (opt_class === undefined) {
      opt_class = '';
   }

   if (opt_prefix === undefined) {
      opt_prefix = '/#address=';
   }

   if (opt_class) {
      return sprintf('<a href="%1$s%2$s" class="%3$s">%2$s</a>', opt_prefix, this.correctForm(), opt_class);
   } else {
      return sprintf('<a href="%1$s%2$s">%2$s</a>', opt_prefix, this.correctForm());
   }
}

v6.Address.prototype.possibleAddresses = function(opt_subnetSize) {
   if (opt_subnetSize === undefined) {
      opt_subnetSize = 0;
   }

   return addCommas(new BigInteger('2', 10).pow((v6.BITS - this.subnetMask) - (v6.BITS - opt_subnetSize)).toString(10));
};

v6.Address.prototype.isInSubnet = function(address) {
   if (this.mask(address.subnetMask) == address.mask()) {
      return true;
   } else {
      return false;
   }
};

v6.Address.prototype.startAddress = function() {
   var bigInteger = new BigInteger(this.mask() + repeatString(0, v6.BITS - this.subnetMask), 2);

   return v6.Address.fromBigInteger(bigInteger);
};

v6.Address.prototype.endAddress = function() {
   var bigInteger = new BigInteger(this.mask() + repeatString(1, v6.BITS - this.subnetMask), 2);

   return v6.Address.fromBigInteger(bigInteger);
};

v6.Address.prototype.getScope = function() {
   return v6.SCOPES[this.getBits(12, 16)];
};

v6.Address.prototype.getType = function() {
   var TYPES = {
      '::/128': 'Unspecified',
      '::1/128': 'Loopback',
      'ff00::/8': 'Multicast',
      'fe80::/10': 'Link-local unicast'
   };

   var type = 'Global unicast';

   for (var p in TYPES) {
      if (!TYPES.hasOwnProperty(p)) {
         continue;
      }

      if (this.isInSubnet(new v6.Address(p))) {
         type = TYPES[p];

         break;
      }
   }

   return type;
};

v6.Address.prototype.getBits = function(start, end) {
   return new BigInteger(this.getBitsBase2(start, end), 2);
};

v6.Address.prototype.getBitsBase2 = function(start, end) {
   return this.binaryZeroPad().slice(start, end);
};

v6.Address.prototype.getBitsBase16 = function(start, end) {
   var length = end - start;

   if (length % 4 != 0) {
      return;
   }

   return v6.Address.zeroPad(this.getBits(start, end).toString(16), length / 4);
};

v6.Address.prototype.getBitsPastSubnet = function() {
   return this.getBitsBase2(this.subnetMask, v6.BITS);
};

v6.Address.prototype.isTeredo = function() {
   if (this.isInSubnet(new v6.Address('2001::/32'))) {
      return true;
   }

   return false;
};

function spanLeadingZeroesInner(group) {
   return group.replace(/^(0+)/, '<span class="zero">$1</span>');
}

v6.Address.spanAll = function(s, opt_offset) {
   if (opt_offset === undefined) {
      opt_offset = 0;
   }

   var letters = s.split('');

   return map(letters, function(n, i) {
      return sprintf('<span class="digit value-%s position-%d">%s</span>', n,
         i + opt_offset,
         v6.Address.spanAllZeroes(n)); // XXX Use #base-2 .value-0 instead?
   }).join('');
};

v6.Address.spanAllZeroes = function(s) {
   return s.replace(/(0+)/g, '<span class="zero">$1</span>');
};

v6.Address.spanLeadingZeroes = function(address) {
   var groups = address.split(':');

   groups = map(groups, function(g, i) {
      return spanLeadingZeroesInner(g);
   });

   return groups.join(':');
};

v6.Address.simpleGroup = function(addressString, offset) {
   var groups = addressString.split(':');

   if (!offset) {
      offset = 0;
   }

   groups = map(groups, function(g, i) {
      if (/group-v4/.test(g)) {
         return g;
      }

      return sprintf('<span class="hover-group group-%d">%s</span>', i + offset,
         spanLeadingZeroesInner(g));
   });

   return groups.join(':');
};

v6.Address.group = function(addressString) {
   var address = new v6.Address(addressString);
   var address4 = address.address.match(v6.RE_V4);

   if (address4) {
      // The IPv4 case
      var segments = address4[0].split('.');

      address.address = address.address.replace(v6.RE_V4, sprintf('<span class="hover-group group-v4 group-6">%s</span>' +
         '.' +
         '<span class="hover-group group-v4 group-7">%s</span>',
         segments.slice(0, 2).join('.'),
         segments.slice(2, 4).join('.')));
   }

   if (address.elidedGroups == 0) {
      // The simple case
      return v6.Address.simpleGroup(address.address);
   } else {
      // The elided case
      var output = [];

      var halves = address.address.split('::');

      if (halves[0].length) {
         output.push(v6.Address.simpleGroup(halves[0]));
      } else {
         output.push('');
      }

      var classes = ['hover-group'];

      for (var i = address.elisionBegin; i < address.elisionBegin + address.elidedGroups; i++) {
         classes.push(sprintf('group-%d', i));
      }

      output.push(sprintf('<span class="%s"></span>', classes.join(' ')));

      if (halves[1].length) {
         output.push(v6.Address.simpleGroup(halves[1], address.elisionEnd));
      } else {
         output.push('');
      }

      return output.join(':');
   }
};

v6.Address.prototype.correctForm = function() {
   if (!this.parsedAddress) {
      return;
   }

   var groups = [];

   var zeroCounter = 0;
   var zeroes = [];

   for (var i = 0; i < this.parsedAddress.length; i++) {
      var value = parseInt(this.parsedAddress[i], 16);

      if (value === 0) {
         zeroCounter++;
      }

      if (value !== 0 && zeroCounter > 0) {
         if (zeroCounter > 1) {
            zeroes.push([i - zeroCounter, i - 1]);
         }

         zeroCounter = 0;
      }
   }

   // Do we end with a string of zeroes?
   if (zeroCounter > 1) {
      zeroes.push([this.parsedAddress.length - zeroCounter, this.parsedAddress.length - 1]);
   }

   var zeroLengths = map(zeroes, function(n) {
      return (n[1] - n[0]) + 1;
   });

   if (zeroes.length > 0) {
      var max = Math.max.apply(Math, zeroLengths);
      var index = zeroLengths.indexOf(max);

      groups = v6.Address.compact(this.parsedAddress, zeroes[index]);
   } else {
      groups = this.parsedAddress;
   }

   for (var i = 0; i < groups.length; i++) {
      if (groups[i] != 'compact') {
         groups[i] = parseInt(groups[i], 16).toString(16);
      }
   }

   var correct = groups.join(':');

   correct = correct.replace(/^compact$/, '::');
   correct = correct.replace(/^compact|compact$/, ':');
   correct = correct.replace(/compact/, '');

   return correct;
};

function repeatString(s, n) {
   var result = '';

   for (var i = 0; i < n; i++) {
      result += s;
   }

   return result;
}

v6.Address.zeroPad = function(s, n) {
   return String(repeatString(0, n) + s).slice(n * -1);
};

v6.Address.prototype.binaryZeroPad = function() {
   return v6.Address.zeroPad(this.bigInteger().toString(2), v6.BITS);
};

v6.Address.prototype.parse = function(address) {
   var subnet = v6.RE_SUBNET_STRING.exec(address);

   if (subnet) {
      this.subnetMask = parseInt(subnet[0].replace('/', ''));
      this.subnet = subnet[0];

      if (this.subnetMask < 0 || this.subnetMask > v6.BITS) {
         this.valid = false;
         this.error = "Invalid subnet mask.";

         return;
      }

      address = address.replace(v6.RE_SUBNET_STRING, '');
   }

   var zone = v6.RE_ZONE_STRING.exec(address);

   if (zone) {
      this.zone = zone[0];

      address = address.replace(v6.RE_ZONE_STRING, '');
   }

   var address4 = address.match(v6.RE_V4);

   if (address4) {
      var temp4 = new v4.Address(address4[0]);

      for (var i = 0; i < temp4.groups; i++) {
         if (/^0[0-9]+/.test(temp4.parsedAddress[i])) {
            this.valid = false;
            this.error = 'IPv4 addresses can not have leading zeroes.';

            this.parseError = address.replace(v6.RE_V4, map(temp4.parsedAddress, function(n) {
               n = n.replace(/^(0{1,})([1-9]+)$/, '<span class="parse-error">$1</span>$2');
               n = n.replace(/^(0{1,})(0)$/, '<span class="parse-error">$1</span>$2');

               return n;
            }).join('.'));

            return;
         }
      }

      if (/[0-9]$/.test(address.replace(v6.RE_V4, ''))) {
         this.valid = false;
         this.error = 'Invalid v4-in-v6 address';

         this.parseError = address.replace(v6.RE_V4,
            sprintf('<span class="parse-error">%s</span>', address4));

         return;
      }

      address = address.replace(v6.RE_V4, temp4.toHex());
   }

   var badCharacters = address.match(v6.RE_BAD_CHARACTERS);

   if (badCharacters) {
      this.valid = false;
      this.error = sprintf("Bad character%s detected in address: %s",
         badCharacters.length > 1 ? 's' : '', badCharacters.join(''));

      this.parseError = address.replace(v6.RE_BAD_CHARACTERS,
         sprintf('<span class="parse-error">$1</span>'));

      return;
   }

   var badAddress = address.match(v6.RE_BAD_ADDRESS);

   if (badAddress) {
      this.valid = false;
      this.error = sprintf("Address failed regex: %s", badAddress.join(''));

      this.parseError = address.replace(v6.RE_BAD_ADDRESS,
         sprintf('<span class="parse-error">$1</span>'));

      return;
   }

   var groups = [];

   var halves = address.split('::');

   if (halves.length == 2) {
      var first = halves[0].split(':');
      var last = halves[1].split(':');

      if (first.length == 1 &&
         first[0] == '') {
         first = [];
      }

      if (last.length == 1 &&
         last[0] == '') {
         last = [];
      }

      var remaining = this.groups - (first.length + last.length);

      if (!remaining) {
         this.valid = false;
         this.error = "Error parsing groups";

         return;
      }

      this.elidedGroups = remaining;

      this.elisionBegin = first.length;
      this.elisionEnd = first.length + this.elidedGroups;

      for (var i = 0; i < first.length; i++) {
         groups.push(first[i]);
      }

      for (var i = 0; i < remaining; i++) {
         groups.push(0);
      }

      for (var i = 0; i < last.length; i++) {
         groups.push(last[i]);
      }
   } else if (halves.length == 1) {
      groups = address.split(':');

      this.elidedGroups = 0;
   } else {
      this.valid = false;
      this.error = "Too many :: groups found";

      return;
   }

   groups = map(groups, function(g) {
      return sprintf('%x', parseInt(g, 16));
   });

   if (groups.length != this.groups) {
      this.valid = false;
      this.error = "Incorrect number of groups found";

      return;
   }

   for (var i = 0; i < groups.length; i++) {
      if (groups[i].length > 4 && !address4) {
         this.valid = false;
         this.error = sprintf("Group %d is too long", i + 1);

         return;
      }
   }

   this.valid = true;

   return groups;
};

v6.Address.prototype.canonicalForm = function() {
   if (!this.valid) {
      return;
   }

   return map(this.parsedAddress, function(n) {
      return sprintf("%04x", parseInt(n, 16));
   }).join(':');
};

v6.Address.prototype.decimal = function() {
   if (!this.valid) {
      return;
   }

   return map(this.parsedAddress, function(n) {
      return sprintf("%05d", parseInt(n, 16));
   }).join(':');
};

v6.Address.prototype.bigInteger = function() {
   if (!this.valid) {
      return;
   }

   return new BigInteger(map(this.parsedAddress, function(n) {
      return sprintf("%04x", parseInt(n, 16));
   }).join(''), 16);
};

v6.Address.prototype.v4inv6 = function() {
   var binary = this.binaryZeroPad().split('');

   var address4 = v4.Address.fromHex(new BigInteger(binary.slice(96, 128).join(''), 2).toString(16));
   var address6 = new v6.Address(this.parsedAddress.slice(0, 6).join(':'), 6);

   var correct = address6.correctForm();

   var infix = '';

   if (!/:$/.test(correct)) {
      infix = ':';
   }

   return address6.correctForm() + infix + address4.address;
};

v6.Address.prototype.teredo = function() {
   /*
      - Bits 0 to 31 are set to the Teredo prefix (normally 2001:0000::/32).
      - Bits 32 to 63 embed the primary IPv4 address of the Teredo server that is used.
      - Bits 64 to 79 can be used to define some flags. Currently only the higher order bit is used; it is set to 1 if the Teredo client is located behind a cone NAT, 0 otherwise. For Microsoft's Windows Vista and Windows Server 2008 implementations, more bits are used. In those implementations, the format for these 16 bits is "CRAAAAUG AAAAAAAA", where "C" remains the "Cone" flag. The "R" bit is reserved for future use. The "U" bit is for the Universal/Local flag (set to 0). The "G" bit is Individual/Group flag (set to 0). The A bits are set to a 12-bit randomly generated number chosen by the Teredo client to introduce additional protection for the Teredo node against IPv6-based scanning attacks.
      - Bits 80 to 95 contains the obfuscated UDP port number. This is the port number that is mapped by the NAT to the Teredo client with all bits inverted.
      - Bits 96 to 127 contains the obfuscated IPv4 address. This is the public IPv4 address of the NAT with all bits inverted.
   */

   var s = this.binaryZeroPad().split('');

   var prefix = this.getBitsBase16(0, 32);

   var flags = this.getBits(64, 80);
   var flagsBase2 = this.getBitsBase2(64, 80);

   var coneNat = flags.testBit(15);

   var reserved = flags.testBit(14);
   var groupIndividual = flags.testBit(8);
   var universalLocal = flags.testBit(9);
   var random = new BigInteger(flagsBase2.slice(2, 6) + flagsBase2.slice(8, 16), 2).toString(10);

   var udpPort = this.getBits(80, 96);
   udpPort = udpPort.xor(new BigInteger('ffff', 16)).toString();

   var server4 = v4.Address.fromHex(this.getBitsBase16(32, 64));

   var client4 = this.getBits(96, 128);
   client4 = v4.Address.fromHex(client4.xor(new BigInteger('ffffffff', 16)).toString(16));

   return {
      prefix: sprintf('%s:%s', prefix.slice(0, 4), prefix.slice(4, 8)),
      server4: server4.address,
      client4: client4.address,
      flags: flagsBase2,
      windows: {
         reserved: reserved,
         universalLocal: universalLocal,
         groupIndividual: groupIndividual,
         random: random
      },
      coneNat: coneNat,
      udpPort: udpPort
   };
};
