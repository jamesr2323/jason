class Jason::ApiModel
  cattr_accessor :models
  attr_accessor :model, :name

  def self.configure(models)
    @@models = models
  end

  def initialize(name)
    @name = name
    @model = OpenStruct.new(JASON_API_MODEL[name.to_sym])
  end

  def allowed_params
    model.allowed_params || []
  end

  def include_models
    model.include_models || []
  end

  def include_methods
    model.include_methods || []
  end

  def priority_scope
    model.priority_scope || []
  end

  def subscribed_fields
    model.subscribed_fields || []
  end

  def scope
    model.scope
  end

  def as_json_config
    include_configs = include_models.map do |assoc|
      reflection = name.classify.constantize.reflect_on_association(assoc.to_sym)
      api_model = Jason::ApiModel.new(reflection.klass.name.underscore)
      { assoc => { only: api_model.subscribed_fields, methods: api_model.include_methods } }
    end

    { only: subscribed_fields, include: include_configs, methods: include_methods }
  end
end